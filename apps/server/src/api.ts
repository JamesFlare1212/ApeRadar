import { setTimeout as sleep } from 'node:timers/promises'
import type { CombatStats, PlayerStats, RadarPlayer, SupportedRegion, Settings } from '@aperadar/shared/types'
import { isSupportedRegion } from '@aperadar/shared/types'
import { DEFAULT_API_CONFIG, vortexApiUrl, wgApiUrl, type ApiConfig } from '@aperadar/shared/api-config'

export const DOMAINS: Record<SupportedRegion, string> = { ASIA: 'worldofwarships.asia', NA: 'worldofwarships.com', EU: 'worldofwarships.eu', RU: 'korabli.su' }
type Json = Record<string, unknown>
export const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const number = (value: unknown): number => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0 }
export const hiddenProfile = (value: unknown) => value === true || value === 1 || (typeof value === 'string' && value.toLowerCase() === 'true')
export function parseCombat(value: unknown): CombatStats {
  const raw = object(value)
  if (!Object.keys(raw).length) return { battles: 0, wins: 0, damage: null, xp: null }
  const count = (input: unknown) => {
    if (!['number', 'string'].includes(typeof input) || input === '' || !Number.isSafeInteger(Number(input)) || Number(input) < 0) throw new Error('战绩场次或胜场格式无效')
    return Number(input)
  }
  const battles = count(raw.battles_count ?? raw.battles), wins = count(raw.wins)
  if (wins > battles) throw new Error('战绩胜场大于总场次，暂不采用这份数据')
  const optional = (input: unknown) => input === undefined || input === null || !Number.isFinite(Number(input)) || Number(input) < 0 ? null : Number(input)
  return { battles, wins, damage: optional(raw.damage_dealt), xp: optional(raw.original_exp) }
}
export function normalizeProfile(raw: unknown): Pick<PlayerStats, 'overall' | 'solo' | 'div2' | 'div3' | 'karma'> {
  const profile = object(raw)
  const stats = object(profile.statistics)
  const pvp = object(stats.pvp)
  if (!('battles_count' in pvp || 'battles' in pvp) || !('wins' in pvp)) throw new Error('账号统计暂不可用，未将其视为隐藏资料')
  return { overall: parseCombat(stats.pvp), solo: parseCombat(stats.pvp_solo), div2: parseCombat(stats.pvp_div2), div3: parseCombat(stats.pvp_div3), karma: object(stats.basic).karma === undefined ? null : number(object(stats.basic).karma) }
}
class HttpError extends Error { constructor(message: string, readonly retry: boolean, readonly wait = 0) { super(message) } }
export interface ApiOptions { fetcher?: typeof fetch; spacing?: number; concurrency?: number; timeout?: number; config?: ApiConfig }
export class WargamingApi {
  private running = 0
  private queue: (() => void)[] = []
  private nextStart = 0
  private readonly fetcher: typeof fetch
  private readonly config: ApiConfig
  constructor(private settings: Settings, private options: ApiOptions = {}) { this.fetcher = options.fetcher ?? fetch; this.config = options.config ?? DEFAULT_API_CONFIG }
  private async slot<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    if (this.running >= (this.options.concurrency ?? this.config.requests.concurrency)) await new Promise<void>(resolve => this.queue.push(resolve))
    else this.running++
    try {
      signal.throwIfAborted()
      const start = Math.max(Date.now(), this.nextStart)
      this.nextStart = start + (this.options.spacing ?? this.config.requests.spacingMs)
      if (start > Date.now()) await sleep(start - Date.now(), undefined, { signal })
      return await work()
    } finally { const next = this.queue.shift(); if (next) next(); else this.running-- }
  }
  async json(url: string, signal: AbortSignal): Promise<Json> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.slot(async () => {
          const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(this.options.timeout ?? this.config.requests.timeoutMs)])
          const response = await this.fetcher(url, { signal: requestSignal, headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }, redirect: 'error' })
          if (!response.ok) {
            const retryAfter = response.headers.get('retry-after')
            const wait = retryAfter ? Math.min(10000, Math.max(0, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now())) : 0
            throw new HttpError(`战绩服务返回 HTTP ${response.status}`, response.status === 429 || response.status >= 500, wait)
          }
          if (Number(response.headers.get('content-length')) > 4 * 1024 * 1024) throw new HttpError('战绩响应过大', false)
          const reader = response.body?.getReader()
          let text = ''
          if (reader) {
            const decoder = new TextDecoder()
            let size = 0
            try {
              while (true) {
                const { value, done } = await reader.read()
                if (done) break
                size += value.byteLength
                if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new HttpError('战绩响应过大', false) }
                text += decoder.decode(value, { stream: true })
              }
              text += decoder.decode()
            } finally { reader.releaseLock() }
          }
          let result: Json
          try { result = object(JSON.parse(text)) } catch { throw new HttpError('战绩服务返回了非 JSON 内容，请稍后重试', false) }
          if (result.status !== 'ok') throw new HttpError(`战绩服务暂不可用：${String(object(result.error).message ?? '未知响应')}`, false)
          return result
        }, signal)
      } catch (error) {
        signal.throwIfAborted()
        if (attempt >= this.settings.retryAttempts || (error instanceof HttpError && !error.retry)) throw error
        await sleep(error instanceof HttpError && error.wait > 0 ? error.wait : Math.min(4000, 400 * 2 ** attempt), undefined, { signal })
      }
    }
  }
  private finish(player: RadarPlayer, data: Partial<RadarPlayer>): RadarPlayer { return { ...player, ...data, fetchedAt: new Date().toISOString(), cached: false } }
  private async vortex(player: RadarPlayer, signal: AbortSignal): Promise<RadarPlayer> {
    if (!isSupportedRegion(player.region)) throw new Error('此区服已停止支持在线查询')
    const root = vortexApiUrl(this.config, player.region, '').replace(/\/$/, '')
    const search = await this.json(`${root}/search/${encodeURIComponent(player.name)}/`, signal)
    const match = array(search.data).map(object).find(item => String(item.name).toLowerCase() === player.name.toLowerCase())
    if (!match || !/^\d+$/.test(String(match.spa_id))) return this.finish(player, { status: 'not-found', error: '该区服未找到匹配账号' })
    const id = String(match.spa_id)
    const account = object(object((await this.json(`${root}/${id}/`, signal)).data)[id])
    if (hiddenProfile(account.hidden_profile)) return this.finish(player, { accountId: id, status: 'hidden', error: null, stats: null })
    const profile = normalizeProfile(account)
    const results = await Promise.allSettled([
      this.json(`${root}/${id}/clans/`, signal),
      ...['pvp', 'pvp_solo', 'pvp_div2', 'pvp_div3'].map(mode => this.json(`${root}/${id}/ships/${player.ship.id}/${mode}/`, signal)),
    ])
    signal.throwIfAborted()
    const clan = results[0].status === 'fulfilled' ? object(results[0].value.data) : {}
    const clanData = object(clan.clan)
    const modes = ['pvp', 'pvp_solo', 'pvp_div2', 'pvp_div3']
    const ship = results.slice(1).map((result, i) => {
      if (result.status !== 'fulfilled') return null
      const data = object(object(result.value.data)[id])
      if (hiddenProfile(data.hidden_profile)) return null
      return parseCombat(object(object(data.statistics)[player.ship.id])[modes[i]])
    })
    return this.finish(player, { accountId: id, status: 'ready', clanTag: String(clanData.tag ?? ''), clanId: clan.clan_id == null ? null : String(clan.clan_id), error: results.some(result => result.status === 'rejected') ? '部分详情未取得，可重试失败数据' : null, stats: { ...profile, ship: ship[0] ?? parseCombat(null), shipSolo: ship[1] ?? parseCombat(null), shipDiv2: ship[2] ?? parseCombat(null), shipDiv3: ship[3] ?? parseCombat(null), shipAvailable: ship.every(mode => mode !== null) } })
  }
  private wgUrl(region: SupportedRegion, endpoint: 'search' | 'account/info' | 'clans/accountinfo' | 'ships/stats', parameters: Record<string, string>) {
    const pathname = endpoint === 'search' ? 'account/list' : endpoint
    return wgApiUrl(this.config, this.settings, region, pathname, parameters)
  }
  private async wgGroup(players: RadarPlayer[], signal: AbortSignal, onPlayer: (p: RadarPlayer) => void) {
    const region = players[0].region
    if (!isSupportedRegion(region)) throw new Error('此区服已停止支持在线查询')
    const search = await this.json(this.wgUrl(region, 'search', { type: 'exact', search: players.map(p => p.name).join(',') }), signal)
    const lookup = array(search.data).map(object)
    const identified = players.map(player => ({ player, id: String(lookup.find(p => String(p.nickname).toLowerCase() === player.name.toLowerCase())?.account_id ?? '') }))
    for (const item of identified.filter(p => !/^\d+$/.test(p.id))) onPlayer(this.finish(item.player, { status: 'not-found', error: '该区服未找到匹配账号' }))
    const found = identified.filter(p => /^\d+$/.test(p.id))
    if (!found.length) return
    const ids = found.map(p => p.id).join(',')
    const account = await this.json(this.wgUrl(region, 'account/info', { account_id: ids, extra: 'statistics.pvp_solo,statistics.pvp_div2,statistics.pvp_div3' }), signal)
    const clans = await this.json(this.wgUrl(region, 'clans/accountinfo', { account_id: ids, extra: 'clan', fields: 'clan_id,clan.tag' }), signal).catch(error => { signal.throwIfAborted(); return { data: {}, error: String(error) } })
    await parallel(found, 4, async ({ player, id }) => {
      try {
        signal.throwIfAborted()
        const profile = object(object(account.data)[id])
        const clan = object(object(clans.data)[id])
        const identity = { accountId: id, clanId: clan.clan_id == null ? null : String(clan.clan_id), clanTag: String(object(clan.clan).tag ?? '') }
        if (hiddenProfile(profile.hidden_profile)) { onPlayer(this.finish(player, { ...identity, status: 'hidden', stats: null, error: null })); return }
        const stats = normalizeProfile(profile)
        const result = await this.json(this.wgUrl(region, 'ships/stats', { account_id: id, ship_id: player.ship.id, extra: 'pvp_solo,pvp_div2,pvp_div3' }), signal)
        const ship = object(array(object(result.data)[id])[0])
        onPlayer(this.finish(player, { ...identity, status: 'ready', error: 'error' in clans ? '军团详情暂未取得，可重试补齐' : null, stats: { ...stats, ship: parseCombat(ship.pvp), shipSolo: parseCombat(ship.pvp_solo), shipDiv2: parseCombat(ship.pvp_div2), shipDiv3: parseCombat(ship.pvp_div3), shipAvailable: true } }))
      } catch (error) { signal.throwIfAborted(); onPlayer(this.finish(player, { accountId: id, status: 'unavailable', stats: null, error: message(error) })) }
    })
  }
  async query(players: RadarPlayer[], signal: AbortSignal, onPlayer: (p: RadarPlayer) => void) {
    const groups = new Map<string, RadarPlayer[]>()
    for (const player of players) {
      if (player.status === 'bot') { onPlayer(player); continue }
      if (!isSupportedRegion(player.region)) { onPlayer(this.finish(player, { status: 'unavailable', error: '此区服已停止支持在线查询', stats: null })); continue }
      const wg = this.settings.api === 'WG_PUBLIC' && player.region !== 'RU'
      const key = `${wg ? 'wg' : 'vortex'}:${player.region}`
      groups.set(key, [...groups.get(key) ?? [], player])
    }
    await Promise.all([...groups].map(async ([key, group]) => {
      if (key.startsWith('wg')) {
        try { await this.wgGroup(group, signal, onPlayer) }
        catch (error) { signal.throwIfAborted(); group.forEach(player => onPlayer(this.finish(player, { status: 'unavailable', error: message(error), stats: null }))) }
      } else await parallel(group, 4, async player => {
        try { onPlayer(await this.vortex(player, signal)) }
        catch (error) { signal.throwIfAborted(); onPlayer(this.finish(player, { status: 'unavailable', error: message(error), stats: null })) }
      })
    }))
  }
}
export function message(error: unknown) { return error instanceof Error ? error.message : String(error) }
export async function parallel<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  let index = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (index < items.length) { const item = items[index++]; await work(item) } }))
}
