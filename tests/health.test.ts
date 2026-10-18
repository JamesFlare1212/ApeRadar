import { describe, expect, it, vi } from 'vitest'
import { probeApiHealth } from '@aperadar/server/health'
import { RadarService } from '@aperadar/server/service'
import { RadarDatabase } from '@aperadar/server/database'
import { catalog, settings } from './helpers.js'

const available = () => Response.json({ status: 'ok', data: [] })
const signal = () => new AbortController().signal

describe('API health probes', () => {
  it('checks each source and region once with bounded concurrency and no player data', async () => {
    const urls: URL[] = []
    let active = 0, highest = 0
    const fetcher = (async (input: unknown, init?: RequestInit) => {
      urls.push(new URL(String(input)))
      expect(init?.cache).toBe('no-store')
      expect(init?.redirect).toBe('error')
      active++; highest = Math.max(highest, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--
      return available()
    }) as typeof fetch
    const health = await probeApiHealth(settings(), ['ASIA', 'EU', 'ASIA'], signal(), { fetcher })
    expect(urls).toHaveLength(4)
    expect(highest).toBeLessThanOrEqual(4)
    expect(health.status).toBe('healthy')
    expect(health.checks.filter(check => check.active).map(check => check.region)).toEqual(['ASIA', 'EU'])
    expect(health.checks.every(check => check.ok && check.httpStatus === 200 && check.latencyMs !== null)).toBe(true)
    expect(health.checks.every(check => !check.endpoint.includes('application_id'))).toBe(true)
    expect(urls.find(url => url.hostname === 'api.worldofwarships.eu')?.searchParams.get('application_id')).toBe(settings().wgApplicationId)
    expect(urls.filter(url => url.hostname.startsWith('vortex.')).every(url => url.pathname.endsWith('/search/ApeRadarHealthCheck/'))).toBe(true)
  })

  it('uses the RU Vortex fallback and excludes removed regions and unconfigured APIs', async () => {
    const fetcher = vi.fn(async () => available()) as unknown as typeof fetch
    const health = await probeApiHealth({ ...settings(), api: 'WG_PUBLIC', wgApplicationId: '' }, ['ASIA', 'RU', 'CN'], signal(), { fetcher })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(health.checks.filter(check => check.status === 'unsupported')).toHaveLength(1)
    expect(health.checks.find(check => check.region === 'ASIA' && check.source === 'WG_PUBLIC')).toMatchObject({ active: true, status: 'unconfigured', latencyMs: null })
    expect(health.checks.filter(check => check.active && check.ok).map(check => check.region)).toEqual(['RU'])
    expect(health.checks.every(check => check.region !== 'CN')).toBe(true)
    expect(health.status).toBe('degraded')
  })

  it('uses only the selected sources for the aggregate and preserves HTTP failures without retrying', async () => {
    let count = 0
    const fetcher = (async (input: unknown) => { count++; return String(input).includes('vortex.') ? available() : new Response('blocked', { status: 429 }) }) as typeof fetch
    const health = await probeApiHealth({ ...settings(), api: 'VORTEX' }, ['ASIA'], signal(), { fetcher })
    expect(count).toBe(2)
    expect(health.status).toBe('healthy')
    expect(health.checks[1]).toMatchObject({ status: 'error', httpStatus: 429, failure: 'http', message: '请求过于频繁' })
  })

  it('does not probe removed regions or report an empty set as healthy', async () => {
    const fetcher = vi.fn(async () => available()) as unknown as typeof fetch
    const health = await probeApiHealth(settings(), ['CN'], signal(), { fetcher })
    expect(fetcher).not.toHaveBeenCalled()
    expect(health).toMatchObject({ status: 'unavailable', checks: [] })
  })

  it('rejects malformed successful search payloads', async () => {
    const fetcher = (async () => Response.json({ status: 'ok', data: {} })) as typeof fetch
    const health = await probeApiHealth(settings(), ['ASIA'], signal(), { fetcher })
    expect(health.checks.every(check => check.failure === 'invalid-response')).toBe(true)
  })

  it('rejects HTTP 200 HTML and API errors', async () => {
    const fetcher = (async (input: unknown) => {
      const url = String(input)
      if (url.includes('vortex.')) return new Response('<html>challenge</html>')
      return Response.json({ status: 'error', error: { message: 'INVALID_APPLICATION_ID' } })
    }) as typeof fetch
    const health = await probeApiHealth(settings(), ['ASIA'], signal(), { fetcher })
    expect(health.status).toBe('unavailable')
    expect(health.checks.map(check => check.failure)).toEqual(['invalid-response', 'api'])
    expect(health.checks[1].message).toBe('INVALID_APPLICATION_ID')
    expect(health.checks.every(check => check.httpStatus === 200 && !check.ok)).toBe(true)
  })

  it('times out stalled requests and distinguishes timeouts from connection failures', async () => {
    const fetcher = (async (input: unknown, init?: RequestInit) => {
      if (!String(input).includes('vortex.')) throw new TypeError('Failed to fetch')
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
    }) as typeof fetch
    const health = await probeApiHealth(settings(), ['ASIA'], signal(), { fetcher, timeout: 15 })
    expect(health.checks[0]).toMatchObject({ status: 'timeout', failure: 'timeout', httpStatus: null })
    expect(health.checks[1]).toMatchObject({ status: 'error', failure: 'network', httpStatus: null })
  })

  it('caps response bodies and allows cancellation to propagate instead of reporting an outage', async () => {
    const fetcher = (async () => new Response('x'.repeat(65 * 1024))) as typeof fetch
    const health = await probeApiHealth(settings(), ['ASIA'], signal(), { fetcher })
    expect(health.checks.every(check => check.failure === 'invalid-response' && check.message.includes('过大'))).toBe(true)
    const controller = new AbortController()
    controller.abort()
    await expect(probeApiHealth(settings(), ['ASIA'], controller.signal, { fetcher })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('health lifecycle', () => {
  it('starts with unknown health, merges manual refreshes, and repeats every minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const fetcher = vi.fn(async () => available()) as unknown as typeof fetch
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, undefined, { fetcher })
    try {
      expect(service.state().health).toMatchObject({ status: 'unknown', checking: false, checkedAt: null })
      expect(fetcher).not.toHaveBeenCalled()
      service.saveSettings(settings())
      service.startHealthChecks()
      const first = service.checkApiHealth()
      expect(service.checkApiHealth()).toBe(first)
      expect(service.state().health.checking).toBe(true)
      await first
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(service.state().health).toMatchObject({ status: 'healthy', checking: false })
      service.saveSettings({ ...service.state().settings, theme: 'dark' })
      expect(fetcher).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(fetcher).toHaveBeenCalledTimes(4)
      service.saveSettings({ ...service.state().settings, region: 'EU' })
      await service.checkApiHealth()
      expect(service.state().health.checks.every(check => check.region === 'EU')).toBe(true)
      expect(fetcher).toHaveBeenCalledTimes(6)
    } finally { service.dispose(); vi.useRealTimers() }
  })

  it('cancels a previous region probe and prevents stale results after a routing change or shutdown', async () => {
    let finishAsia: (() => void) | undefined
    const asia = new Promise<void>(resolve => { finishAsia = resolve })
    const fetcher = (async (input: unknown) => {
      if (String(input).includes('.asia') || String(input).includes('/asia/')) await asia
      return available()
    }) as typeof fetch
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, undefined, { fetcher })
    try {
      service.saveSettings(settings())
      service.startHealthChecks()
      const previous = service.checkApiHealth().catch(error => error as Error)
      service.saveSettings({ ...service.state().settings, region: 'EU' })
      await service.checkApiHealth()
      finishAsia?.()
      expect(await previous).toMatchObject({ name: 'AbortError' })
      expect(service.state().health.checks.every(check => check.region === 'EU')).toBe(true)
      const pending = service.checkApiHealth().catch(error => error as Error)
      service.dispose()
      expect(await pending).toMatchObject({ name: 'AbortError' })
    } finally { finishAsia?.(); service.dispose() }
  })
  it('does not probe a guessed region when AUTO has no client evidence', async () => {
    const fetcher = vi.fn(async () => available()) as unknown as typeof fetch
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, undefined, { fetcher })
    try {
      const state = await service.checkApiHealth()
      expect(fetcher).not.toHaveBeenCalled()
      expect(state.health).toMatchObject({ status: 'unknown', checking: false, checks: [] })
      expect(state.health.message).toContain('选择游戏目录')
    } finally { service.dispose() }
  })
})
