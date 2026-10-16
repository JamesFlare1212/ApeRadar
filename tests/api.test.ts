import { describe, expect, it, vi } from 'vitest'
import { hiddenProfile, normalizeProfile, parseCombat, WargamingApi } from '@aperadar/server/api'
import { fixturePlayer, settings } from './helpers.js'

describe('transport and response boundaries', () => {
  it.each(['VORTEX', 'WG_PUBLIC'] as const)('blocks archived CN players without any network request through %s', async source => {
    const fetcher = vi.fn() as unknown as typeof fetch
    const player = { ...fixturePlayer(), region: 'CN' as const }
    const result = [] as typeof player[]
    await new WargamingApi({ ...settings(), api: source }, { fetcher }).query([player], new AbortController().signal, value => result.push(value as typeof player))
    expect(fetcher).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ status: 'unavailable', stats: null, error: '此区服已停止支持在线查询' })
  })
  it('distinguishes explicit hidden from a false flag or missing statistics', () => {
    expect(hiddenProfile(true)).toBe(true); expect(hiddenProfile('True')).toBe(true)
    expect(hiddenProfile(false)).toBe(false); expect(hiddenProfile('false')).toBe(false)
    expect(() => normalizeProfile({ hidden_profile: false })).toThrow('暂不可用')
  })
  it('rejects malformed count fields instead of fabricating zero or a perfect winrate', () => {
    expect(() => parseCombat({ battles_count: 'invalid', wins: 0 })).toThrow('格式无效')
    expect(() => parseCombat({ battles: 10, wins: 20 })).toThrow('胜场大于')
    expect(() => normalizeProfile({ statistics: { pvp: {} } })).toThrow('暂不可用')
    expect(parseCombat({ battles_count: 0, wins: 0 }).battles).toBe(0)
  })
  it('rejects non-2xx responses and retries a rate limit', async () => {
    let count = 0
    const fetcher = (async () => ++count === 1 ? new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }) : Response.json({ status: 'ok', data: {} })) as typeof fetch
    const api = new WargamingApi(settings(), { fetcher, spacing: 0 })
    expect((await api.json('https://fixture.invalid/test', new AbortController().signal)).status).toBe('ok')
    expect(count).toBe(2)
  })
  it('does not mark HTML error pages or API errors as hidden players', async () => {
    const api = new WargamingApi(settings(), { fetcher: (async () => new Response('<html>error</html>')) as typeof fetch, spacing: 0 })
    await expect(api.json('https://fixture.invalid/test', new AbortController().signal)).rejects.toThrow('非 JSON')
  })
  it('caps in-flight requests globally', async () => {
    let active = 0, highest = 0
    const api = new WargamingApi(settings(), { concurrency: 2, spacing: 0, fetcher: (async () => { active++; highest = Math.max(highest, active); await new Promise(resolve => setTimeout(resolve, 10)); active--; return Response.json({ status: 'ok' }) }) as typeof fetch })
    await Promise.all(Array.from({ length: 9 }, () => api.json('https://fixture.invalid/test', new AbortController().signal)))
    expect(highest).toBeLessThanOrEqual(2)
  })
  it('finds an exact nickname beyond the first search result and treats false as public', async () => {
    const player = fixturePlayer(), shipId = player.ship.id
    const fetcher = (async (input: unknown) => {
      const url = String(input)
      let data: unknown
      if (url.includes('/search/')) {
        // Real Vortex returns 308 for a search path without its trailing slash.
        expect(new URL(url).pathname).toBe(`/api/accounts/search/${encodeURIComponent(player.name)}/`)
        data = [{ name: 'OtherCaptain', spa_id: 7 }, { name: player.name, spa_id: 42 }]
      }
      else if (url.includes('/clans/')) data = { clan: { tag: 'TEST' }, clan_id: 21 }
      else if (url.includes('/ships/')) { const mode = url.split('/').filter(Boolean).at(-1)!; data = { '42': { statistics: { [shipId]: { [mode]: { wins: 12, battles_count: 20, damage_dealt: 1200000, original_exp: 30000 } } } } } }
      else data = { '42': { hidden_profile: false, statistics: { pvp: { wins: 60, battles_count: 100 }, pvp_solo: { wins: 60, battles_count: 100 }, basic: { karma: 9 } } } }
      return Response.json({ status: 'ok', data })
    }) as typeof fetch
    const api = new WargamingApi(settings(), { fetcher, spacing: 0 })
    const result = [] as typeof player[]
    await api.query([player], new AbortController().signal, p => result.push(p as typeof player))
    expect(result[0].accountId).toBe('42'); expect(result[0].status).toBe('ready'); expect(result[0].stats?.ship.battles).toBe(20)
  })
  it('batches WG identity/profile/clan requests without an unused Vortex dependency', async () => {
    const first = fixturePlayer(), second = { ...fixturePlayer(), key: 'second', name: 'AnotherCaptain' }
    const seen: string[] = [], result: string[] = []
    const fetcher = (async (input: unknown) => {
      const url = new URL(String(input)); seen.push(url.href)
      let data: unknown
      if (url.pathname.includes('/account/list')) data = [{ nickname: first.name, account_id: 42 }, { nickname: second.name, account_id: 43 }]
      else if (url.pathname.includes('/account/info')) data = { '42': { hidden_profile: false, statistics: { pvp: { battles: 100, wins: 60 } } }, '43': { hidden_profile: false, statistics: { pvp: { battles: 200, wins: 100 } } } }
      else if (url.pathname.includes('/clans/')) data = { '42': {}, '43': {} }
      else data = { [url.searchParams.get('account_id')!]: [{ pvp: { wins: 10, battles: 20 } }] }
      return Response.json({ status: 'ok', data })
    }) as typeof fetch
    const api = new WargamingApi({ ...settings(), api: 'WG_PUBLIC' }, { fetcher, spacing: 0 })
    await api.query([first, second], new AbortController().signal, player => { result.push(player.status) })
    expect(result).toEqual(['ready', 'ready'])
    expect(seen).toHaveLength(5)
    expect(seen.every(url => url.startsWith('https://api.'))).toBe(true)
  })
})
