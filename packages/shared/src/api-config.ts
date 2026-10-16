import { z } from 'zod'
import bundledConfig from '../../../config/api.json' with { type: 'json' }
import type { Settings, SupportedRegion } from './types.ts'

const applicationId = z.string().trim().regex(/^[a-zA-Z0-9]*$/).max(64)
const endpoint = z.string().url().refine(value => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}, 'Use an HTTP(S) base URL without credentials, query parameters, or a fragment').transform(value => {
  const url = new URL(value)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.href
})
const wgEndpoints = z.object({ ASIA: endpoint, NA: endpoint, EU: endpoint }).strict()
const vortexEndpoints = z.object({ ASIA: endpoint, NA: endpoint, EU: endpoint, RU: endpoint }).strict()
const requests = z.object({
  timeoutMs: z.number().int().min(1).max(120_000),
  spacingMs: z.number().int().min(0).max(60_000),
  concurrency: z.number().int().min(1).max(32),
  healthTimeoutMs: z.number().int().min(1).max(120_000),
  healthIntervalMs: z.number().int().min(1000).max(3_600_000),
}).strict()

export const apiConfigSchema = z.object({
  wgApplicationId: applicationId,
  endpoints: z.object({ wg: wgEndpoints, vortex: vortexEndpoints }).strict(),
  requests,
}).strict()

const overridesSchema = z.object({
  wgApplicationId: applicationId.optional(),
  endpoints: z.object({ wg: wgEndpoints.partial().optional(), vortex: vortexEndpoints.partial().optional() }).strict().optional(),
  requests: requests.partial().optional(),
}).strict()

export type ApiConfig = z.infer<typeof apiConfigSchema>
export const DEFAULT_API_CONFIG: ApiConfig = apiConfigSchema.parse(bundledConfig)

export function mergeApiConfig(value: unknown, defaults: ApiConfig = DEFAULT_API_CONFIG): ApiConfig {
  const overrides = overridesSchema.parse(value)
  return apiConfigSchema.parse({
    ...defaults, ...overrides,
    endpoints: { wg: { ...defaults.endpoints.wg, ...overrides.endpoints?.wg }, vortex: { ...defaults.endpoints.vortex, ...overrides.endpoints?.vortex } },
    requests: { ...defaults.requests, ...overrides.requests },
  })
}

export function wgApiUrl(config: ApiConfig, settings: Pick<Settings, 'wgApplicationId'>, region: SupportedRegion, method: string, parameters: Record<string, string>): string {
  if (region === 'RU') throw new Error('此区服使用 Vortex 接口')
  const url = new URL(`${method}/`, config.endpoints.wg[region])
  url.search = new URLSearchParams({ ...parameters, application_id: settings.wgApplicationId }).toString()
  return url.href
}

export function vortexApiUrl(config: ApiConfig, region: SupportedRegion, relativePath: string): string {
  return new URL(relativePath, config.endpoints.vortex[region]).href
}
