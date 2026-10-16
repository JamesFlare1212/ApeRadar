import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_API_CONFIG, mergeApiConfig, vortexApiUrl, wgApiUrl } from '@aperadar/shared/api-config'
import { loadApiConfig, type RuntimeApiConfig } from '@aperadar/server/config'
import { WargamingApi } from '@aperadar/server/api'
import { probeApiHealth } from '@aperadar/server/health'
import { RadarDatabase } from '@aperadar/server/database'
import { RadarService } from '@aperadar/server/service'
import { arena, catalog, fixturePlayer, removeTemp, settings, tempDirectory } from './helpers'

const directories: string[] = []
afterEach(() => { directories.splice(0).forEach(removeTemp) })
function directory() { const value = tempDirectory(); directories.push(value); return value }
const signal = () => new AbortController().signal
const runtime = (config = mergeApiConfig({ wgApplicationId: 'fileApplicationId' })): RuntimeApiConfig => ({ config, filePath: 'fixture-api-config.json', applicationIdSource: 'file' })

describe('API configuration files', () => {
  it('merges partial configuration and preserves custom path prefixes', () => {
    const config = mergeApiConfig({ endpoints: { wg: { EU: 'https://wg.fixture.invalid/custom/wows' } }, requests: { concurrency: 2 } })
    expect(config.endpoints.wg).toMatchObject({ EU: 'https://wg.fixture.invalid/custom/wows/', NA: DEFAULT_API_CONFIG.endpoints.wg.NA })
    expect(config.requests).toMatchObject({ concurrency: 2, timeoutMs: DEFAULT_API_CONFIG.requests.timeoutMs })
    const url = new URL(wgApiUrl(config, { wgApplicationId: 'configuredId' }, 'EU', 'account/list', { search: 'Test Captain', application_id: 'ignoredId' }))
    expect(url.pathname).toBe('/custom/wows/account/list/')
    expect(url.searchParams.get('application_id')).toBe('configuredId')
    expect(url.searchParams.get('search')).toBe('Test Captain')
    expect(() => wgApiUrl(config, settings(), 'RU', 'account/list', {})).toThrow('Vortex')
  })

  it.each(['file:///private/data', 'ftp://fixture.invalid/api/', 'https://user:password@fixture.invalid/api/', 'https://fixture.invalid/api/?token=secret', 'https://fixture.invalid/api/#fragment', 'not a URL'])('rejects unsafe or malformed endpoint %s', value => {
    expect(() => mergeApiConfig({ endpoints: { vortex: { ASIA: value } } })).toThrow()
  })

  it('rejects misspelled keys, invalid IDs, and invalid request limits', () => {
    expect(() => mergeApiConfig({ wgApplicationID: 'typo' })).toThrow()
    expect(() => mergeApiConfig({ wgApplicationId: 'invalid id' })).toThrow()
    expect(() => mergeApiConfig({ requests: { concurrency: 0 } })).toThrow()
    expect(() => mergeApiConfig({ requests: { timeoutMs: 0 } })).toThrow()
    expect(() => mergeApiConfig({ requests: { healthIntervalMs: -1 } })).toThrow()
  })

  it('loads BOM-prefixed JSON and lets environment variables override the file and ID', async () => {
    const root = directory()
    const first = path.join(root, 'default.json'), selected = path.join(root, 'selected.json')
    await writeFile(first, JSON.stringify({ wgApplicationId: 'defaultId' }))
    await writeFile(selected, '\uFEFF' + JSON.stringify({ wgApplicationId: 'fileId', endpoints: { vortex: { RU: 'https://ru.fixture.invalid/accounts' } } }))
    const loaded = await loadApiConfig(first, { environment: { APERADAR_CONFIG_FILE: selected, WG_APPLICATION_ID: 'environmentId' } })
    expect(loaded).toMatchObject({ filePath: selected, applicationIdSource: 'environment', config: { wgApplicationId: 'environmentId' } })
    expect(vortexApiUrl(loaded.config, 'RU', 'search/Test/')).toBe('https://ru.fixture.invalid/accounts/search/Test/')
    expect((await loadApiConfig(first, { environment: {} })).config.wgApplicationId).toBe('defaultId')
  })

  it('initializes a missing desktop file once and preserves user edits', async () => {
    const file = path.join(directory(), 'user-data', 'api-config.json')
    const first = await loadApiConfig(file, { createIfMissing: true, environment: {} })
    expect(first.config).toEqual(DEFAULT_API_CONFIG)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(DEFAULT_API_CONFIG)
    await writeFile(file, JSON.stringify({ wgApplicationId: 'personalId' }))
    expect((await loadApiConfig(file, { createIfMissing: true, environment: {} })).config.wgApplicationId).toBe('personalId')
  })

  it('reports invalid files without echoing credentials and never creates a missing explicit override', async () => {
    const root = directory(), file = path.join(root, 'broken.json'), missing = path.join(root, 'missing.json')
    await writeFile(file, '{broken-json')
    await expect(loadApiConfig(file, { environment: {} })).rejects.toThrow('Invalid JSON')
    await writeFile(file, JSON.stringify({ wgApplicationId: 'private invalid credential' }))
    await expect(loadApiConfig(file, { environment: {} })).rejects.toThrow('wgApplicationId')
    await expect(loadApiConfig(file, { environment: {} })).rejects.not.toThrow('private invalid credential')
    await expect(loadApiConfig(file, { createIfMissing: true, environment: { APERADAR_CONFIG_FILE: missing } })).rejects.toThrow('does not exist')
    await expect(readFile(missing)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('configured API requests and health checks', () => {
  it('uses the same custom WG endpoint and ID for player lookups and health probes', async () => {
    const config = mergeApiConfig({ endpoints: { wg: { ASIA: 'https://wg.fixture.invalid/prefix/wows' } }, requests: { spacingMs: 0, healthIntervalMs: 120000 } })
    const selected = { ...settings(), api: 'WG_PUBLIC' as const, wgApplicationId: 'requestId', retryAttempts: 0 }
    const urls: URL[] = []
    const fetcher = (async (input: unknown) => { urls.push(new URL(String(input))); return Response.json({ status: 'ok', data: [] }) }) as typeof fetch
    const players: string[] = []
    await new WargamingApi(selected, { config, fetcher }).query([fixturePlayer()], signal(), player => { players.push(player.status) })
    const health = await probeApiHealth(selected, ['ASIA'], signal(), { config, fetcher })
    const wg = urls.filter(url => url.host === 'wg.fixture.invalid')
    expect(wg).toHaveLength(2)
    expect(wg.every(url => url.pathname === '/prefix/wows/account/list/' && url.searchParams.get('application_id') === 'requestId')).toBe(true)
    expect(players).toEqual(['not-found'])
    expect(health.intervalMs).toBe(120000)
    expect(health.checks.find(check => check.source === 'WG_PUBLIC')?.endpoint).toBe('https://wg.fixture.invalid/prefix/wows/account/list/')
  })

  it('uses custom RU Vortex routing when WG is selected and never sends a WG ID to Vortex', async () => {
    const config = mergeApiConfig({ endpoints: { vortex: { RU: 'https://ru.fixture.invalid/prefix/accounts/' } }, requests: { spacingMs: 0 } })
    const urls: URL[] = []
    const fetcher = (async (input: unknown) => { urls.push(new URL(String(input))); return Response.json({ status: 'ok', data: [] }) }) as typeof fetch
    const player = { ...fixturePlayer(), region: 'RU' as const }
    await new WargamingApi({ ...settings(), api: 'WG_PUBLIC' }, { config, fetcher }).query([player], signal(), () => {})
    const health = await probeApiHealth({ ...settings(), api: 'WG_PUBLIC' }, ['RU'], signal(), { config, fetcher })
    expect(urls).toHaveLength(2)
    expect(urls.every(url => url.host === 'ru.fixture.invalid' && url.pathname.startsWith('/prefix/accounts/search/') && !url.searchParams.has('application_id'))).toBe(true)
    expect(health.checks.find(check => check.source === 'WG_PUBLIC')?.status).toBe('unsupported')
  })

  it('enforces configured concurrency and request timeouts', async () => {
    const config = mergeApiConfig({ requests: { concurrency: 1, spacingMs: 0, timeoutMs: 15 } })
    let active = 0, highest = 0
    const fetcher = (async () => { active++; highest = Math.max(highest, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return Response.json({ status: 'ok' }) }) as typeof fetch
    const api = new WargamingApi(settings(), { config, fetcher })
    await Promise.all(Array.from({ length: 4 }, () => api.json('https://fixture.invalid/test', signal())))
    expect(highest).toBe(1)
    const stalled = new WargamingApi({ ...settings(), retryAttempts: 0 }, { config, fetcher: (async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))) as typeof fetch })
    await expect(stalled.json('https://fixture.invalid/test', signal())).rejects.toMatchObject({ name: 'TimeoutError' })
  })
})

describe('runtime configuration and persisted settings', () => {
  it('applies a managed ID without overwriting the stored fallback during preference saves', () => {
    const database = new RadarDatabase(':memory:')
    database.saveSettings({ ...settings(), wgApplicationId: 'savedId' })
    const service = new RadarService(database, catalog, undefined, {}, runtime())
    try {
      expect(service.state()).toMatchObject({ settings: { wgApplicationId: 'fileApplicationId' }, apiConfiguration: { applicationIdManaged: true, applicationIdSource: 'file' } })
      service.saveSettings({ ...service.state().settings, theme: 'dark', wgApplicationId: 'rendererOverride' })
      expect(service.state().settings).toMatchObject({ theme: 'dark', wgApplicationId: 'fileApplicationId' })
      expect(database.getSettings()).toMatchObject({ theme: 'dark', wgApplicationId: 'savedId' })
    } finally { service.dispose() }
  })

  it('allows the saved settings ID when the configuration ID is empty', () => {
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, undefined, {}, runtime(mergeApiConfig({ wgApplicationId: '' })))
    try {
      service.saveSettings({ ...service.state().settings, wgApplicationId: 'editableId' })
      expect(service.state()).toMatchObject({ settings: { wgApplicationId: 'editableId' }, apiConfiguration: { applicationIdManaged: false } })
      expect(service.database.getSettings().wgApplicationId).toBe('editableId')
    } finally { service.dispose() }
  })

  it('schedules periodic health checks using the configured interval', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async () => Response.json({ status: 'ok', data: [] })) as unknown as typeof fetch
    const config = mergeApiConfig({ requests: { healthIntervalMs: 1000 } })
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, undefined, { fetcher }, runtime(config))
    try {
      service.startHealthChecks()
      await service.checkApiHealth()
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(service.state().health.intervalMs).toBe(1000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(fetcher).toHaveBeenCalledTimes(4)
    } finally { service.dispose(); vi.useRealTimers() }
  })

  it('does not reuse player caches from a different endpoint configuration', async () => {
    const filename = path.join(directory(), 'cache.sqlite')
    const querySizes: number[] = []
    const provider = vi.fn(() => ({ query: async (players: ReturnType<typeof fixturePlayer>[], _signal: AbortSignal, emit: (player: ReturnType<typeof fixturePlayer>) => void) => { querySizes.push(players.length); for (const player of players) emit({ ...player, status: 'ready', stats: fixturePlayer().stats, cached: false, fetchedAt: new Date().toISOString() }) } }))
    const first = new RadarService(new RadarDatabase(filename), catalog, provider, {}, runtime())
    try {
      await first.importArena({ name: 'fixture.json', base64: Buffer.from(JSON.stringify(arena())).toString('base64') }, false)
      await first.query()
      await first.query()
      expect(first.state().battle?.players[0].cached).toBe(true)
    } finally { first.dispose() }
    const changed = mergeApiConfig({ wgApplicationId: 'fileApplicationId', endpoints: { vortex: { ASIA: 'https://changed.fixture.invalid/accounts/' } } })
    const second = new RadarService(new RadarDatabase(filename), catalog, provider, {}, runtime(changed))
    try {
      await second.query()
      expect(second.state().battle?.players[0].cached).toBe(false)
      expect(querySizes).toEqual([1, 0, 1])
    } finally { second.dispose() }
  })
})
