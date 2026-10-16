import { EventEmitter } from 'node:events'
import { statSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import type { Activity, AppState, Battle, FilePayload, QueryOptions, Settings, WatchInput } from '@aperadar/shared/types'
import { fileSchema, querySchema, settingsSchema, watchSchema } from '@aperadar/shared/settings'
import { teamSummary } from '@aperadar/shared/statistics'
import { buildBattle, latestArena, parseArenaBytes, readArenaFile, resolveRegion, type ShipCatalog } from './arena.ts'
import { WargamingApi, message } from './api.ts'
import { RadarDatabase } from './database.ts'
import { createDemo } from './demo.ts'
import { initialApiHealth, probeApiHealth, type ApiHealthOptions } from './health.ts'
import type { RuntimeApiConfig } from './config.ts'

export type ProviderFactory = (settings: Settings) => Pick<WargamingApi, 'query'>
export class RadarService extends EventEmitter {
  private settings: Settings
  private battle: Battle | null
  private activities: Activity[] = []
  private queryState: AppState['query'] = { status: 'idle', done: 0, total: 0, message: '等待导入阵容' }
  private monitorState: AppState['monitor'] = { enabled: false, lastFile: null, message: '自动监测未开启' }
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private scanning = false
  private lastStamp = ''
  private monitorError = ''
  private disposed = false
  private health = initialApiHealth()
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private healthController: AbortController | null = null
  private healthPending: Promise<AppState> | null = null
  constructor(readonly database: RadarDatabase, readonly catalog: ShipCatalog, private providerFactory: ProviderFactory = settings => new WargamingApi(settings, { config: runtimeConfig?.config }), private healthOptions: ApiHealthOptions = {}, private runtimeConfig?: RuntimeApiConfig) {
    super()
    this.settings = this.configuredSettings(database.getSettings())
    this.healthOptions = { ...healthOptions, config: runtimeConfig?.config ?? healthOptions.config }
    this.health = initialApiHealth(this.healthOptions.config?.requests.healthIntervalMs)
    this.battle = database.lastBattle() ?? createDemo(catalog)
    this.log('info', '欢迎回来。导入阵容或连接游戏目录，开始查看战局。', false)
  }
  state(): AppState {
    return structuredClone({ settings: this.settings, battle: this.battle, watchlist: this.database.getWatchlist(),
      history: this.database.listBattles().map(b => ({ id: b.id, map: b.map, mode: b.mode, startedAt: b.startedAt, isDemo: b.isDemo, region: [...new Set(b.players.map(p => p.region))].join(' / '), playerCount: b.players.length, readyCount: b.players.filter(p => p.status === 'ready').length, allyWinrate: teamSummary(b, 'ally', this.settings).accountWinrate, enemyWinrate: teamSummary(b, 'enemy', this.settings).accountWinrate })),
      query: this.queryState, monitor: this.monitorState, health: this.health,
      apiConfiguration: { filePath: this.runtimeConfig?.filePath ?? null, applicationIdManaged: !!this.runtimeConfig?.config.wgApplicationId, applicationIdSource: this.runtimeConfig?.config.wgApplicationId ? this.runtimeConfig.applicationIdSource : null },
      activities: this.activities, shipVersion: `${this.catalog.version} · ${this.catalog.date}`, dataLocation: this.database.filename,
    })
  }
  private configuredSettings(settings: Settings): Settings {
    return this.runtimeConfig?.config.wgApplicationId ? { ...settings, wgApplicationId: this.runtimeConfig.config.wgApplicationId } : settings
  }
  private publish() { if (!this.disposed) this.emit('state', this.state()) }
  private log(level: Activity['level'], text: string, publish = true) {
    if (this.disposed) return
    this.activities = [{ id: randomUUID(), time: new Date().toISOString(), level, message: text }, ...this.activities].slice(0, 60)
    if (publish) this.publish()
  }
  private stopQuery() { this.controller?.abort(); this.controller = null; this.queryState = { ...this.queryState, status: 'idle', message: '查询已取消' } }
  startHealthChecks() {
    if (this.disposed || this.healthTimer) return
    this.healthTimer = setInterval(() => this.refreshHealth(), this.health.intervalMs)
    this.healthTimer.unref()
    this.refreshHealth()
  }
  private refreshHealth(reset = false) {
    if (reset) {
      this.healthController?.abort()
      this.healthController = null
      this.healthPending = null
      this.health = initialApiHealth(this.health.intervalMs)
    }
    void this.checkApiHealth().catch(error => { if (!this.disposed && !(error instanceof Error && error.name === 'AbortError')) this.log('warning', `API 健康检查未完成：${message(error)}`) })
  }
  checkApiHealth(): Promise<AppState> {
    if (this.disposed) return Promise.reject(new Error('应用已关闭'))
    if (this.healthPending) return this.healthPending
    const controller = new AbortController()
    this.healthController = controller
    this.health = { ...this.health, checking: true }
    this.publish()
    const settings = structuredClone(this.settings)
    const currentRegion = !this.battle?.isDemo ? this.battle?.players.find(player => player.team === 'ally')?.region ?? this.battle?.players[0]?.region : undefined
    const pending = (async () => {
      const primary = settings.region === 'AUTO' ? await resolveRegion(settings).catch(() => currentRegion ?? 'ASIA' as const) : settings.region
      const regions = settings.secondaryEnabled ? [primary, settings.secondaryRegion] : [primary]
      const health = await probeApiHealth(settings, regions, controller.signal, this.healthOptions)
      controller.signal.throwIfAborted()
      if (!this.disposed && this.healthController === controller) { this.health = health; this.publish() }
      return this.state()
    })().finally(() => {
      if (this.healthController === controller) { this.healthController = null; this.healthPending = null }
    })
    this.healthPending = pending
    return pending
  }
  async importArena(input: FilePayload, autoQuery = true) {
    const file = fileSchema.parse(input)
    return this.importBytes(Buffer.from(file.base64, 'base64'), file.name, autoQuery)
  }
  async importBytes(bytes: Buffer, filename: string, autoQuery = true): Promise<AppState> {
    const region = await resolveRegion(this.settings)
    const battle = buildBattle(parseArenaBytes(bytes), filename, this.settings, region, this.catalog)
    this.stopQuery()
    this.battle = battle
    if (this.healthTimer && this.settings.region === 'AUTO') this.refreshHealth(true)
    this.database.saveBattle(battle)
    this.queryState = { status: 'idle', done: 0, total: battle.players.filter(p => p.status !== 'bot').length, message: '阵容已导入，等待查询' }
    this.log('success', `阵容已导入：${battle.players.length} 位玩家`)
    if (autoQuery && this.settings.autoQuery) void this.query().catch(error => this.log('error', message(error)))
    return this.state()
  }
  loadDemo(): AppState {
    this.stopQuery()
    this.battle = createDemo(this.catalog)
    this.queryState = { status: 'complete', done: 24, total: 24, message: '示例对局 · 数据为合成演示，不发起网络请求' }
    this.log('info', '已载入示例对局；示例玩家和战绩均为合成数据。')
    return this.state()
  }
  loadBattle(id: string): AppState {
    if (typeof id !== 'string' || id.length > 100) throw new Error('对局编号无效')
    const battle = this.database.getBattle(id)
    if (!battle) throw new Error('未找到这场对局')
    this.stopQuery()
    this.battle = battle
    this.database.saveBattle(battle)
    this.queryState = { status: 'idle', done: 0, total: 0, message: '已打开历史快照' }
    this.log('info', '已打开本地保存的对局快照')
    return this.state()
  }
  async query(input: QueryOptions = {}): Promise<AppState> {
    const options = querySchema.parse(input)
    if (!this.battle) throw new Error('请先导入阵容')
    if (this.battle.isDemo) {
      this.queryState = { status: 'complete', done: 24, total: 24, message: '示例对局无需联网；请导入真实阵容开始查询' }
      this.publish()
      return this.state()
    }
    this.stopQuery()
    const controller = new AbortController()
    this.controller = controller
    const battle = this.battle
    const id = battle.id
    const settings = structuredClone(this.settings)
    const players = battle.players.filter(p => p.status !== 'bot' && (!options.failedOnly || ['unavailable', 'not-found', 'pending'].includes(p.status) || p.error))
    const done = new Set<string>()
    this.queryState = { status: 'loading', done: 0, total: players.length, message: '正在查询玩家战绩…' }
    this.log('info', `开始查询 ${players.length} 位玩家；最多 ${this.runtimeConfig?.config.requests.concurrency ?? 6} 个并发请求。`)
    const cachePrefix = this.runtimeConfig ? `${settings.api}:${createHash('sha256').update(JSON.stringify({ endpoints: this.runtimeConfig.config.endpoints, applicationId: settings.wgApplicationId })).digest('hex').slice(0, 16)}` : settings.api
    const pending = []
    const onPlayer = (player: Battle['players'][number]) => {
      if (controller.signal.aborted || this.controller !== controller || this.battle?.id !== id || done.has(player.key)) return
      done.add(player.key)
      const index = battle.players.findIndex(p => p.key === player.key)
      if (index >= 0) battle.players[index] = player
      if (!player.cached) this.database.cacheSet(`${cachePrefix}:${player.key}`, player, settings.cacheMinutes)
      this.queryState = { status: 'loading', done: done.size, total: players.length, message: `已处理 ${done.size} / ${players.length} 位玩家` }
      this.publish()
    }
    for (const player of players) {
      const cached = !options.force && this.database.cacheGet(`${cachePrefix}:${player.key}`)
      if (cached) onPlayer({ ...cached, key: player.key, ship: player.ship, team: player.team, isSelf: player.isSelf })
      else pending.push(player)
    }
    try {
      await this.providerFactory(settings).query(pending, controller.signal, onPlayer)
      if (controller.signal.aborted || this.controller !== controller || this.battle?.id !== id) return this.state()
      this.database.saveBattle(battle)
      const failed = battle.players.filter(p => p.status === 'unavailable' || p.status === 'not-found' || p.error).length
      this.queryState = { status: 'complete', done: done.size, total: players.length, message: failed ? `查询完成，${failed} 位玩家有待补齐的数据` : '战绩已更新，所有可查询玩家均处理完成' }
      this.log(failed ? 'warning' : 'success', this.queryState.message)
    } catch (error) {
      if (!controller.signal.aborted && this.controller === controller) {
        this.queryState = { ...this.queryState, status: 'complete', message: message(error) }
        this.log('error', `查询未完成：${message(error)}`)
      }
    } finally { if (this.controller === controller) { this.controller = null; this.publish() } }
    return this.state()
  }
  cancelQuery(): AppState { this.stopQuery(); if (this.battle && !this.battle.isDemo) this.database.saveBattle(this.battle); this.publish(); return this.state() }
  saveSettings(input: unknown): AppState {
    const settings = this.configuredSettings(settingsSchema.parse(input))
    const old = this.settings
    const routingChanged = settings.region !== old.region || settings.secondaryEnabled !== old.secondaryEnabled || settings.secondaryRegion !== old.secondaryRegion || settings.api !== old.api || settings.wgApplicationId !== old.wgApplicationId
    if (routingChanged) this.stopQuery()
    this.settings = settings
    // A file-managed ID must not overwrite the user's saved fallback when another preference changes.
    this.database.saveSettings(this.runtimeConfig?.config.wgApplicationId ? { ...settings, wgApplicationId: this.database.getSettings().wgApplicationId } : settings)
    if (routingChanged && this.battle && !this.battle.isDemo) {
      this.battle.players = this.battle.players.map(player => ({ ...player, region: settings.secondaryEnabled && player.team === 'enemy' ? settings.secondaryRegion : settings.region === 'AUTO' ? player.region : settings.region, key: `${settings.secondaryEnabled && player.team === 'enemy' ? settings.secondaryRegion : settings.region === 'AUTO' ? player.region : settings.region}:${player.name}:${player.ship.id}`, status: player.status === 'bot' ? 'bot' : 'pending', stats: null, accountId: null, error: null, fetchedAt: null, cached: false }))
      this.database.saveBattle(this.battle)
    }
    if (old.gamePath !== settings.gamePath && this.monitorState.enabled) this.setMonitor(false)
    if (this.healthTimer && (routingChanged || (settings.region === 'AUTO' && old.gamePath !== settings.gamePath))) this.refreshHealth(true)
    this.log('success', '设置已保存到本机')
    return this.state()
  }
  setWatch(input: WatchInput): AppState { this.database.setWatch(watchSchema.parse(input)); this.log('success', input.status ? '关注名单已更新' : '已移除关注记录'); return this.state() }
  setMonitor(enabled: boolean): AppState {
    if (typeof enabled !== 'boolean') throw new Error('监测开关无效')
    if (enabled && !this.settings.gamePath.trim()) throw new Error('请先在设置中选择游戏目录')
    if (enabled) { try { if (!statSync(this.settings.gamePath).isDirectory()) throw new Error() } catch { throw new Error('游戏目录不存在，请在设置中重新选择') } }
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.lastStamp = ''
    this.monitorError = ''
    this.monitorState = { ...this.monitorState, enabled, message: enabled ? '正在等待游戏阵容文件…' : '自动监测已暂停' }
    if (enabled) {
      this.timer = setInterval(() => { void this.scan() }, 2000)
      this.timer.unref()
      void this.scan()
    }
    this.publish()
    return this.state()
  }
  private async scan() {
    if (this.scanning || !this.monitorState.enabled) return
    this.scanning = true
    try {
      const latest = await latestArena(this.settings.gamePath)
      if (!latest || latest.stamp === this.lastStamp || !this.monitorState.enabled) return
      const bytes = await readArenaFile(latest.path)
      if (!this.monitorState.enabled) return
      await this.importBytes(bytes, latest.path)
      this.lastStamp = latest.stamp
      this.monitorError = ''
      this.monitorState = { enabled: true, lastFile: latest.path, message: '已连接 · 新对局将自动载入' }
      this.publish()
    } catch (error) {
      const text = message(error)
      if (this.monitorError !== text) { this.monitorError = text; this.log('warning', `等待可读取的阵容文件：${text}`) }
    } finally { this.scanning = false }
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.monitorState.enabled = false; this.stopQuery(); if (this.timer) clearInterval(this.timer); this.timer = null; this.healthController?.abort(); this.healthController = null; this.healthPending = null; if (this.healthTimer) clearInterval(this.healthTimer); this.healthTimer = null; this.removeAllListeners(); this.database.close() }
}
