import { performance } from 'node:perf_hooks'
import type { ApiHealth, ApiHealthCheck, ApiSource, Region, SupportedRegion, Settings } from '@aperadar/shared/types'
import { isSupportedRegion } from '@aperadar/shared/types'
import { DOMAINS, object, parallel } from './api.ts'

export const HEALTH_INTERVAL_MS = 60_000
export interface ApiHealthOptions { fetcher?: typeof fetch; timeout?: number }
const sources: ApiSource[] = ['VORTEX', 'WG_PUBLIC']
const probeName = 'ApeRadarHealthCheck'
const maximumResponseBytes = 64 * 1024

export function initialApiHealth(): ApiHealth {
  return { status: 'unknown', checking: false, checkedAt: null, intervalMs: HEALTH_INTERVAL_MS, checks: [] }
}

// RU uses Vortex in player queries even when WG is selected.
export function effectiveApiSource(source: ApiSource, region: Region): ApiSource {
  return region === 'RU' ? 'VORTEX' : source
}

function searchUrl(settings: Settings, source: ApiSource, region: SupportedRegion): URL {
  if (source === 'VORTEX') return new URL(`https://vortex.${DOMAINS[region]}/api/accounts/search/${probeName}/`)
  const url = new URL(`https://api.${DOMAINS[region]}/wows/account/list/`)
  url.search = new URLSearchParams({ search: probeName, type: 'exact', limit: '1', ...(source === 'WG_PUBLIC' ? { application_id: settings.wgApplicationId } : {}) }).toString()
  return url
}

async function responseJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > maximumResponseBytes) throw new Error('健康检查响应过大')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('接口没有返回 JSON 内容')
  const decoder = new TextDecoder()
  let text = '', size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximumResponseBytes) { await reader.cancel(); throw new Error('健康检查响应过大') }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  try { return JSON.parse(text) } catch { throw new Error('接口返回了非 JSON 内容') }
}

async function check(settings: Settings, source: ApiSource, region: SupportedRegion, signal: AbortSignal, options: ApiHealthOptions): Promise<ApiHealthCheck> {
  const url = searchUrl(settings, source, region)
  const base: ApiHealthCheck = { source, region, endpoint: url.origin + url.pathname, active: effectiveApiSource(settings.api, region) === source, ok: false, status: 'error', latencyMs: null, httpStatus: null, message: '', failure: null }
  if (source !== 'VORTEX' && region === 'RU') return { ...base, status: 'unsupported', message: '此区服使用 Vortex 接口' }
  if (source === 'WG_PUBLIC' && !settings.wgApplicationId) return { ...base, status: 'unconfigured', message: '请先填写 WG Application ID' }
  const start = performance.now()
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(options.timeout ?? 8000)])
  let httpStatus: number | null = null
  try {
    const response = await (options.fetcher ?? fetch)(url.href, { signal: requestSignal, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, cache: 'no-store', redirect: 'error' })
    httpStatus = response.status
    if (!response.ok) {
      await response.body?.cancel()
      const messages: Record<number, string> = { 401: '需要授权', 403: '访问被拒绝', 404: '接口不存在', 429: '请求过于频繁' }
      return { ...base, httpStatus, latencyMs: Math.round(performance.now() - start), message: messages[response.status] ?? `请求失败（HTTP ${response.status}）`, failure: 'http' }
    }
    let payload: unknown
    try { payload = await responseJson(response) }
    catch (error) {
      if (requestSignal.aborted) throw error
      return { ...base, httpStatus, latencyMs: Math.round(performance.now() - start), message: error instanceof Error ? error.message : '接口响应无效', failure: 'invalid-response' }
    }
    const result = object(payload)
    if (result.status !== 'ok') return { ...base, httpStatus, latencyMs: Math.round(performance.now() - start), message: String(object(result.error).message ?? '接口未返回成功状态').slice(0, 200), failure: 'api' }
    if (!Array.isArray(result.data)) return { ...base, httpStatus, latencyMs: Math.round(performance.now() - start), message: '玩家搜索响应格式不正确', failure: 'invalid-response' }
    return { ...base, ok: true, status: 'healthy', httpStatus, latencyMs: Math.round(performance.now() - start), message: '连接正常' }
  } catch (error) {
    signal.throwIfAborted()
    const timeout = requestSignal.aborted || (error instanceof Error && error.name === 'TimeoutError')
    return { ...base, httpStatus, latencyMs: Math.round(performance.now() - start), status: timeout ? 'timeout' : 'error', failure: timeout ? 'timeout' : 'network', message: timeout ? '连接超时' : '网络连接失败' }
  }
}

// Checks never use the player cache or retry policy: the result describes this connection now.
export async function probeApiHealth(settings: Settings, regions: Region[], signal: AbortSignal, options: ApiHealthOptions = {}): Promise<ApiHealth> {
  const targets = [...new Set(regions)].filter(isSupportedRegion).flatMap(region => sources.map(source => ({ source, region })))
  const checks = new Array<ApiHealthCheck>(targets.length)
  await parallel(targets.map((target, index) => ({ ...target, index })), 4, async ({ source, region, index }) => {
    signal.throwIfAborted()
    checks[index] = await check(settings, source, region, signal, options)
  })
  signal.throwIfAborted()
  const active = checks.filter(item => item.active)
  return { status: active.length && active.every(item => item.ok) ? 'healthy' : active.some(item => item.ok) ? 'degraded' : 'unavailable', checking: false, checkedAt: new Date().toISOString(), intervalMs: HEALTH_INTERVAL_MS, checks }
}
