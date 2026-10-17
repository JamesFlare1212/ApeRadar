import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { ShipCatalogApi, readCatalog, writeCatalog, type ShipCatalog } from '@aperadar/server/ship-catalog'
import { MissingShipLookup } from '@aperadar/server/missing-ships'
import { RadarDatabase } from '@aperadar/server/database'
import { RadarService } from '@aperadar/server/service'
import { arena, catalog, removeTemp, settings, tempDirectory } from './helpers'

const directories: string[] = []
afterEach(() => { vi.restoreAllMocks(); directories.splice(0).forEach(removeTemp) })
const signal = () => new AbortController().signal
const info = { game_version: '15.9.0', ships_updated_at: 1791365645 }
const entry = (name = 'New ship') => ({ 'name_en-us': name, 'name_zh-cn': '新舰船', nation: 'usa', tier: 10, type: 'Cruiser' as const })
const apiShip = (id: string, language: string) => ({ ship_id: Number(id), name: language === 'en' ? `Ship ${id}` : `舰船 ${id}`, nation: 'usa', tier: 10, type: 'Cruiser' })
const ok = (data: unknown, meta?: unknown) => Response.json({ status: 'ok', data, ...(meta ? { meta } : {}) })
const emptyCatalog = (): ShipCatalog => ({ version: '15.5', date: '20260621', ships: {} })
function fixtureFetcher(transform?: (url: URL, response: { data: Record<string, unknown>; meta?: Record<string, number> }) => void) {
  return vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/info/')) return ok(info)
    const params = url.searchParams, language = params.get('language')!
    const ids = params.has('ship_id') ? params.get('ship_id')!.split(',') : [params.get('page_no') === '1' ? '100' : '200']
    const response = {
      data: Object.fromEntries(ids.map(id => [id, apiShip(id, language)])) as Record<string, unknown>,
      meta: params.has('ship_id') ? undefined : { count: ids.length, page: Number(params.get('page_no')), page_total: 2, total: 2 },
    }
    transform?.(url, response)
    return ok(response.data, response.meta)
  })
}

describe('WG ship catalog updates', () => {
  it('merges complete bilingual pages and retains ships absent from the API', async () => {
    const fetcher = fixtureFetcher()
    const previous = { ...emptyCatalog(), ships: { '99': entry('Legacy ship'), '100': entry('Old name') } }
    const result = await new ShipCatalogApi(settings(), { fetcher, spacing: 0 }).updateCatalog(previous, 'EU', signal())
    expect(result.version).toBe('15.9.0')
    expect(result.date).toBe('20261007')
    expect(Object.keys(result.ships)).toEqual(['99', '100', '200'])
    expect(result.ships['100']).toEqual({ ...entry('Ship 100'), 'name_zh-cn': '舰船 100' })
    expect(result.ships['99']).toEqual(previous.ships['99'])
    expect(previous.ships['100']['name_en-us']).toBe('Old name')
    expect(fetcher.mock.calls.every(([url]) => new URL(String(url)).hostname === 'api.worldofwarships.eu')).toBe(true)
  })
  it.each(['duplicate', 'missing-language', 'wrong-total', 'wrong-id', 'invalid-tier', 'changed-pages'])('rejects %s responses without modifying the previous catalog', async kind => {
    const previous = { ...emptyCatalog(), ships: { '99': entry() } }, original = structuredClone(previous)
    const fetcher = fixtureFetcher((url, response) => {
      const page = url.searchParams.get('page_no'), language = url.searchParams.get('language')!
      if (kind === 'duplicate' && page === '2') response.data = { '100': apiShip('100', language) }
      if (kind === 'missing-language' && language === 'zh-cn' && page === '2') response.data = { '300': apiShip('300', language) }
      if (kind === 'wrong-total') response.meta!.total = 3
      if (kind === 'wrong-id') response.data = { '100': apiShip('200', language) }
      if (kind === 'invalid-tier') response.data = { '100': { ...apiShip('100', language), tier: 99 } }
      if (kind === 'changed-pages' && page === '2') response.meta!.page_total = 3
    })
    await expect(new ShipCatalogApi(settings(), { fetcher, spacing: 0 }).updateCatalog(previous, 'NA', signal())).rejects.toThrow()
    expect(previous).toEqual(original)
  })
  it('rejects an encyclopedia version change during download', async () => {
    const base = fixtureFetcher(); let reads = 0
    const fetcher: typeof fetch = async (input, options) => {
      if (String(input).includes('/info/')) return ok({ ...info, game_version: ++reads === 1 ? '15.9.0' : '15.10.0' })
      return base(input, options)
    }
    await expect(new ShipCatalogApi(settings(), { fetcher, spacing: 0 }).updateCatalog(emptyCatalog(), 'NA', signal())).rejects.toThrow('changed during download')
  })
  it('atomically writes a validated catalog and leaves the old file intact on invalid input', async () => {
    const directory = tempDirectory(); directories.push(directory)
    const filename = path.join(directory, 'ships.json'), original = { ...emptyCatalog(), ships: { '99': entry() } }
    await writeCatalog(filename, original)
    await expect(writeCatalog(filename, { ...original, date: 'invalid' })).rejects.toThrow()
    expect(await readCatalog(filename)).toEqual(original)
    expect(await readdir(directory)).toEqual(['ships.json'])
    expect(await readFile(filename, 'utf8')).toContain('新舰船')
  })
  it('deduplicates targeted IDs and splits requests at the API limit', async () => {
    const fetcher = fixtureFetcher(), ids = Array.from({ length: 101 }, (_, i) => String(i + 1))
    const ships = await new ShipCatalogApi(settings(), { fetcher, spacing: 0 }).getShips([...ids, '1'], 'ASIA', signal())
    expect(Object.keys(ships)).toHaveLength(101)
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher.mock.calls.every(([url]) => new URL(String(url)).searchParams.get('ship_id')!.split(',').length <= 100)).toBe(true)
  })
  it('keeps missing bilingual entries unresolved and rejects unrequested IDs', async () => {
    const absent = fixtureFetcher((url, response) => { if (url.searchParams.get('language') === 'zh-cn') response.data['1'] = null })
    expect(await new ShipCatalogApi(settings(), { fetcher: absent, spacing: 0 }).getShips(['1', '2'], 'NA', signal())).toEqual({ '2': { ...entry('Ship 2'), 'name_zh-cn': '舰船 2' } })
    const unexpected = fixtureFetcher((_url, response) => { response.data['3'] = apiShip('3', 'en') })
    await expect(new ShipCatalogApi(settings(), { fetcher: unexpected, spacing: 0 }).getShips(['1'], 'NA', signal())).rejects.toThrow('unrequested')
  })
})

describe('persistent missing ship lookup', () => {
  it('shares in-flight requests and reuses persisted entries offline after restart', async () => {
    const directory = tempDirectory(); directories.push(directory)
    const filename = path.join(directory, 'state.sqlite'), fetcher = fixtureFetcher()
    let database = new RadarDatabase(filename)
    try {
      const lookup = new MissingShipLookup(database, emptyCatalog(), { fetcher, spacing: 0 })
      await Promise.all([lookup.resolve(['1', '1'], 'NA', settings(), signal()), lookup.resolve(['1'], 'NA', settings(), signal())])
      expect(fetcher).toHaveBeenCalledTimes(2)
      database.close(); database = new RadarDatabase(filename)
      const restored = emptyCatalog(), offline = vi.fn<typeof fetch>(async () => { throw new Error('Offline') })
      const reopened = new MissingShipLookup(database, restored, { fetcher: offline })
      await reopened.resolve(['1'], 'NA', settings(), signal())
      expect(restored.ships['1']['name_zh-cn']).toBe('舰船 1')
      expect(offline).not.toHaveBeenCalled()
      const bundled = { ...emptyCatalog(), ships: { '1': entry('Bundled correction') } }
      new MissingShipLookup(database, bundled)
      expect(bundled.ships['1']['name_en-us']).toBe('Bundled correction')
    } finally { database.close() }
  })
  it('backs off failed requests and retries later without caching failures', async () => {
    const database = new RadarDatabase(':memory:'), fetcher = vi.fn<typeof fetch>(async () => { throw new Error('Offline') })
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      const lookup = new MissingShipLookup(database, emptyCatalog(), { fetcher, spacing: 0 })
      const config = { ...settings(), retryAttempts: 0 }
      await expect(lookup.resolve(['1'], 'EU', config, signal())).rejects.toThrow('Offline')
      await lookup.resolve(['1'], 'EU', config, signal())
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(database.getCatalogShips()).toEqual({})
      now.mockReturnValue(61_001)
      await expect(lookup.resolve(['1'], 'EU', config, signal())).rejects.toThrow('Offline')
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { database.close() }
  })
  it('backs off IDs absent from the encyclopedia and skips unsupported regions or absent credentials', async () => {
    const database = new RadarDatabase(':memory:'), fetcher = vi.fn<typeof fetch>(async () => ok({ '1': null }))
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      const lookup = new MissingShipLookup(database, emptyCatalog(), { fetcher, spacing: 0 })
      for (const region of ['RU', 'CN'] as const) await lookup.resolve(['1'], region, settings(), signal())
      await lookup.resolve(['1'], 'NA', { ...settings(), wgApplicationId: '' }, signal())
      expect(fetcher).not.toHaveBeenCalled()
      await lookup.resolve(['1'], 'NA', settings(), signal())
      await lookup.resolve(['1'], 'NA', settings(), signal())
      expect(fetcher).toHaveBeenCalledTimes(2)
      now.mockReturnValue(3_601_001)
      await lookup.resolve(['1'], 'NA', settings(), signal())
      expect(fetcher).toHaveBeenCalledTimes(4)
    } finally { database.close() }
  })
})

describe('battle ship enrichment', () => {
  it('enriches an imported battle even when automatic player queries are disabled', async () => {
    const fetcher = fixtureFetcher(), database = new RadarDatabase(':memory:')
    const service = new RadarService(database, catalog, undefined, { fetcher })
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      const input = arena(); input.vehicles[0].shipId = '1'
      await service.importBytes(Buffer.from(JSON.stringify(input)), 'arena.json', false)
      await vi.waitFor(() => expect(service.state().battle?.players[0].ship.name).toBe('舰船 1'))
      expect(database.lastBattle()?.players[0].ship.nameEn).toBe('Ship 1')
      expect(fetcher.mock.calls.every(([url]) => String(url).includes('/encyclopedia/ships/'))).toBe(true)
    } finally { service.dispose() }
  })
  it('keeps player statistics responsive and prevents late callbacks from restoring unknown ship details', async () => {
    let finish: (() => void) | undefined
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, () => ({ query: (players, _signal, onPlayer) => new Promise<void>(resolve => {
      finish = () => { players.forEach(player => onPlayer({ ...player, status: 'not-found' })); resolve() }
    }) }), { fetcher: fixtureFetcher() })
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      const input = arena(); input.vehicles[0].shipId = '1'
      await service.importBytes(Buffer.from(JSON.stringify(input)), 'arena.json', false)
      const query = service.query()
      await vi.waitFor(() => expect(service.state().battle?.players[0].ship.name).toBe('舰船 1'))
      expect(service.state().query.status).toBe('loading')
      finish?.(); await query
      expect(service.state().battle?.players[0].ship.name).toBe('舰船 1')
    } finally { service.dispose() }
  })
  it('retains imported lineups when the ship API fails', async () => {
    const fetcher: typeof fetch = async () => Response.json({ status: 'error', error: { message: 'UNAVAILABLE' } })
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, undefined, { fetcher })
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      const input = arena(); input.vehicles[0].shipId = '1'
      await service.importBytes(Buffer.from(JSON.stringify(input)), 'arena.json', false)
      await vi.waitFor(() => expect(service.state().activities.some(item => item.level === 'warning')).toBe(true))
      expect(service.state().battle?.players[0].ship.type).toBe('Unknown')
      expect(service.state().history).toHaveLength(1)
    } finally { service.dispose() }
  })
  it('does not restore an old battle after its ship lookup finishes', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve }), base = fixtureFetcher()
    const fetcher: typeof fetch = async (input, options) => { await gate; return base(input, options) }
    const database = new RadarDatabase(':memory:'), service = new RadarService(database, catalog, undefined, { fetcher })
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      const old = arena('OldCaptain'); old.vehicles[0].shipId = '1'
      await service.importBytes(Buffer.from(JSON.stringify(old)), 'old.json', false)
      await service.importBytes(Buffer.from(JSON.stringify(arena('NewCaptain', '16.10.2026 12:01:00'))), 'new.json', false)
      release?.()
      await vi.waitFor(() => expect(database.getCatalogShips()['1']).toBeDefined())
      expect(service.state().battle?.players[0].name).toBe('NewCaptain')
      expect(database.lastBattle()?.players[0].name).toBe('NewCaptain')
    } finally { service.dispose() }
  })
  it('aborts pending lookups on shutdown without using the closed database', async () => {
    let requestSignal: AbortSignal | undefined
    const fetcher: typeof fetch = async (_input, options) => {
      requestSignal = options?.signal ?? undefined
      return new Promise((_resolve, reject) => requestSignal!.addEventListener('abort', () => reject(requestSignal!.reason), { once: true }))
    }
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, undefined, { fetcher })
    service.saveSettings({ ...settings(), autoQuery: false })
    const input = arena(); input.vehicles[0].shipId = '1'
    await service.importBytes(Buffer.from(JSON.stringify(input)), 'arena.json', false)
    service.dispose()
    expect(requestSignal?.aborted).toBe(true)
  })
})
