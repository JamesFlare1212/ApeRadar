import { EventEmitter } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import type { Activity, AppState, Battle, FilePayload, QueryOptions, Settings, SupportedRegion, WatchInput } from '@aperadar/shared/types'
import { fileSchema, querySchema, settingsSchema, watchSchema } from '@aperadar/shared/settings'
import { teamSummary } from '@aperadar/shared/statistics'
import { buildBattle, getShip, latestArena, parseArenaBytes, readArenaFile, resolveRegion, type ShipCatalog } from './arena.ts'
import { WargamingApi, message } from './api.ts'
import { RadarDatabase } from './database.ts'
import { createDemo } from './demo.ts'
import { initialApiHealth, probeApiHealth, type ApiHealthOptions } from './health.ts'
import type { RuntimeApiConfig } from './config.ts'
import { inspectGameClient } from './game-client.ts'
import { MissingShipLookup } from './missing-ships.ts'
import { restoreShipName } from './ship-names.ts'

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
  private monitorGeneration = 0
  private routingRevision = 0
  private lastStamp = ''
  private monitorError = ''
  private disposed = false
  private health = initialApiHealth()
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private healthController: AbortController | null = null
  private healthPending: Promise<AppState> | null = null
  private shipLookup: MissingShipLookup
  private shipController = new AbortController()
  constructor(readonly database: RadarDatabase, readonly catalog: ShipCatalog, private providerFactory: ProviderFactory = settings => new WargamingApi(settings, { config: runtimeConfig?.config }), private healthOptions: ApiHealthOptions = {}, private runtimeConfig?: RuntimeApiConfig) {
    super()
    this.catalog = structuredClone(catalog)
    this.shipLookup = new MissingShipLookup(database, this.catalog, { fetcher: healthOptions.fetcher, config: runtimeConfig?.config ?? healthOptions.config })
    this.settings = this.configuredSettings(database.getSettings())
    this.healthOptions = { ...healthOptions, config: runtimeConfig?.config ?? healthOptions.config }
    this.health = initialApiHealth(this.healthOptions.config?.requests.healthIntervalMs)
    this.battle = database.lastBattle() ?? createDemo(this.catalog)
    this.applyShipDetails(this.battle)
    this.log('info', '欢迎回来。导入阵容或连接游戏目录，开始查看战局。', false)
    void this.refreshMissingShips(this.battle)
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
    const pending = (async () => {
      let primary: SupportedRegion
      try { primary = await resolveRegion(settings) }
      catch (error) {
        controller.signal.throwIfAborted()
        if (!this.disposed && this.healthController === controller) {
          this.health = { ...initialApiHealth(this.health.intervalMs), checkedAt: new Date().toISOString(), message: `尚未检查 API：${message(error)}` }
          this.publish()
        }
        return this.state()
      }
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
  async importBytes(bytes: Buffer, filename: string, autoQuery = true, monitorGeneration?: number): Promise<AppState> {
    const settings = structuredClone(this.settings)
    const revision = this.routingRevision
    const region = await resolveRegion(settings)
    if (this.disposed) throw new Error('应用已关闭')
    if (monitorGeneration !== undefined && (monitorGeneration !== this.monitorGeneration || !this.monitorState.enabled)) return this.state()
    if (revision !== this.routingRevision) throw new Error('游戏或区服设置已变更，请重新导入阵容')
    const battle = buildBattle(parseArenaBytes(bytes), filename, settings, region, this.catalog)
    this.stopQuery()
    this.battle = battle
    if (this.healthTimer && this.settings.region === 'AUTO') this.refreshHealth(true)
    this.database.saveBattle(battle)
    this.queryState = { status: 'idle', done: 0, total: battle.players.filter(p => p.status !== 'bot').length, message: '阵容已导入，等待查询' }
    this.log('success', `阵容已导入：${battle.players.length} 位玩家`)
    void this.refreshMissingShips(battle)
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
    this.applyShipDetails(battle)
    this.database.saveBattle(battle)
    this.queryState = { status: 'idle', done: 0, total: 0, message: '已打开历史快照' }
    this.log('info', '已打开本地保存的对局快照')
    void this.refreshMissingShips(battle)
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
    const revision = this.routingRevision
    this.queryState = { status: 'loading', done: 0, total: 0, message: '正在确认查询区服…' }
    this.publish()
    try {
      const region = await resolveRegion(settings)
      if (controller.signal.aborted || this.controller !== controller || revision !== this.routingRevision || this.battle !== battle) return this.state()
      this.routeBattle(battle, settings, region)
    } catch (error) {
      if (controller.signal.aborted || this.controller !== controller) return this.state()
      this.controller = null
      this.queryState = { status: 'idle', done: 0, total: 0, message: message(error) }
      this.publish()
      throw error
    }
    const players = battle.players.filter(p => p.status !== 'bot' && (!options.failedOnly || ['unavailable', 'not-found', 'pending'].includes(p.status) || p.error))
    void this.refreshMissingShips(battle)
    const done = new Set<string>()
    this.queryState = { status: 'loading', done: 0, total: players.length, message: '正在查询玩家战绩…' }
    this.log('info', `开始查询 ${players.length} 位玩家；最多 ${this.runtimeConfig?.config.requests.concurrency ?? 6} 个并发请求。`)
    const cachePrefix = this.runtimeConfig ? `${settings.api}:${createHash('sha256').update(JSON.stringify({ endpoints: this.runtimeConfig.config.endpoints, applicationId: settings.wgApplicationId })).digest('hex').slice(0, 16)}` : settings.api
    const pending = []
    const onPlayer = (player: Battle['players'][number]) => {
      if (controller.signal.aborted || this.controller !== controller || this.battle?.id !== id || done.has(player.key)) return
      done.add(player.key)
      if (this.catalog.ships[player.ship.id]) player = { ...player, ship: getShip(this.catalog, player.ship.id) }
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
  private applyShipDetails(battle: Battle) {
    for (const player of battle.players) {
      if (player.ship.type === 'Unknown' && this.catalog.ships[player.ship.id]) player.ship = getShip(this.catalog, player.ship.id)
      else player.ship = { ...player.ship, name: restoreShipName(player.ship.nameEn, player.ship.name, player.ship.nation, player.ship.type, player.ship.id) }
    }
  }
  private async refreshMissingShips(battle: Battle): Promise<void> {
    if (battle.isDemo || this.disposed) return
    const settings = structuredClone(this.settings)
    const revision = this.routingRevision
    const regions = [...new Set(battle.players.filter(player => !this.catalog.ships[player.ship.id]).map(player => player.region))]
    if (!regions.length) return
    await Promise.all(regions.map(async region => {
      try {
        await this.shipLookup.resolve(battle.players.filter(player => player.region === region).map(player => player.ship.id), region, settings, this.shipController.signal)
      } catch {
        if (!this.disposed && this.battle === battle && revision === this.routingRevision) this.log('warning', '部分舰船资料暂未取得，将继续使用本地资料，可稍后重试查询。')
      }
    }))
    if (this.disposed || this.battle !== battle || revision !== this.routingRevision) return
    this.applyShipDetails(battle)
    try {
      this.database.saveBattle(battle)
      this.publish()
    } catch { this.log('warning', '舰船资料已取得，但对局快照暂未保存。') }
  }
  private routeBattle(battle: Battle, settings: Settings, primary: SupportedRegion, reset = false) {
    battle.players = battle.players.map(player => {
      const region = settings.secondaryEnabled && player.team === 'enemy' ? settings.secondaryRegion : primary
      if (!reset && player.region === region) return player
      return { ...player, region, key: `${region}:${player.name}:${player.ship.id}`, status: player.status === 'bot' ? 'bot' as const : 'pending' as const, stats: null, accountId: null, error: null, fetchedAt: null, cached: false }
    })
  }
  saveSettings(input: unknown): AppState {
    const settings = this.configuredSettings(settingsSchema.parse(input))
    const old = this.settings
    const routingChanged = settings.region !== old.region || settings.secondaryEnabled !== old.secondaryEnabled || settings.secondaryRegion !== old.secondaryRegion || settings.api !== old.api || settings.wgApplicationId !== old.wgApplicationId || (settings.region === 'AUTO' && settings.gamePath !== old.gamePath)
    if (routingChanged) { this.routingRevision++; this.stopQuery() }
    this.settings = settings
    // A file-managed ID must not overwrite the user's saved fallback when another preference changes.
    this.database.saveSettings(this.runtimeConfig?.config.wgApplicationId ? { ...settings, wgApplicationId: this.database.getSettings().wgApplicationId } : settings)
    if (routingChanged && this.battle && !this.battle.isDemo) {
      const primary = settings.region === 'AUTO' ? this.battle.players.find(player => player.team === 'ally')?.region : settings.region
      // AUTO is resolved again before a query; cleared results cannot be reused
      // while a new path or region is still being inspected asynchronously.
      if (primary && primary !== 'CN') this.routeBattle(this.battle, settings, primary, true)
      this.database.saveBattle(this.battle)
    }
    if (old.gamePath !== settings.gamePath) { this.monitorGeneration++; this.stopMonitor() }
    if (this.healthTimer && (routingChanged || (settings.region === 'AUTO' && old.gamePath !== settings.gamePath))) this.refreshHealth(true)
    this.log('success', '设置已保存到本机')
    return this.state()
  }
  setWatch(input: WatchInput): AppState { this.database.setWatch(watchSchema.parse(input)); this.log('success', input.status ? '关注名单已更新' : '已移除关注记录'); return this.state() }
  private stopMonitor() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.monitorState = { ...this.monitorState, enabled: false, message: '自动监测已暂停' }
  }
  async setMonitor(enabled: boolean): Promise<AppState> {
    if (typeof enabled !== 'boolean') throw new Error('监测开关无效')
    const generation = ++this.monitorGeneration
    this.stopMonitor()
    if (enabled) {
      const inspection = await inspectGameClient(this.settings.gamePath)
      if (this.disposed) throw new Error('应用已关闭')
      if (generation !== this.monitorGeneration) return this.state()
      if (!inspection.valid) { this.publish(); throw new Error(inspection.message) }
    }
    this.lastStamp = ''
    this.monitorError = ''
    this.monitorState = { enabled, lastFile: null, message: enabled ? '目录已验证，正在等待游戏阵容文件…' : '自动监测已暂停' }
    if (enabled) {
      this.timer = setInterval(() => { void this.scan(generation) }, 2000)
      this.timer.unref()
      void this.scan(generation)
    }
    this.publish()
    return this.state()
  }
  private async scan(generation: number) {
    if (this.scanning || !this.monitorState.enabled || generation !== this.monitorGeneration) return
    this.scanning = true
    try {
      const latest = await latestArena(this.settings.gamePath)
      if (!latest || latest.stamp === this.lastStamp || !this.monitorState.enabled || generation !== this.monitorGeneration) return
      const bytes = await readArenaFile(latest.path)
      if (!this.monitorState.enabled || generation !== this.monitorGeneration) return
      await this.importBytes(bytes, latest.path, true, generation)
      if (!this.monitorState.enabled || generation !== this.monitorGeneration) return
      this.lastStamp = latest.stamp
      this.monitorError = ''
      this.monitorState = { enabled: true, lastFile: latest.path, message: '已连接 · 新对局将自动载入' }
      this.publish()
    } catch (error) {
      const text = message(error)
      if (generation === this.monitorGeneration && this.monitorState.enabled && this.monitorError !== text) { this.monitorError = text; this.monitorState = { ...this.monitorState, message: text }; this.log('warning', `等待可读取的阵容文件：${text}`) }
    } finally { this.scanning = false }
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.shipController.abort(); this.monitorState.enabled = false; this.stopQuery(); if (this.timer) clearInterval(this.timer); this.timer = null; this.healthController?.abort(); this.healthController = null; this.healthPending = null; if (this.healthTimer) clearInterval(this.healthTimer); this.healthTimer = null; this.removeAllListeners(); this.database.close() }
}
