import { z } from 'zod'
import type { Settings } from './types.ts'
import { SUPPORTED_REGIONS } from './types.ts'
import { DEFAULT_API_CONFIG } from './api-config.ts'

export const regionSchema = z.enum(SUPPORTED_REGIONS)
export const settingsSchema = z.object({
  gamePath: z.string().max(1024), region: z.enum(['AUTO', ...SUPPORTED_REGIONS]),
  secondaryRegion: regionSchema, secondaryEnabled: z.boolean(),
  api: z.enum(['VORTEX', 'WG_PUBLIC']), wgApplicationId: z.string().regex(/^[a-zA-Z0-9]*$/).max(64),
  theme: z.enum(['light', 'dark', 'system']), winrate: z.enum(['account', 'weighted']), showNames: z.boolean(),
  lightPalette: z.enum(['graphite', 'cyan', 'orange', 'violet', 'forest', 'ocean']).default('graphite'),
  darkPalette: z.enum(['graphite', 'cyan', 'orange', 'violet', 'forest', 'ocean']).default('graphite'),
  autoQuery: z.boolean(), retryAttempts: z.number().int().min(0).max(3), cacheMinutes: z.number().int().min(1).max(1440),
  apeThreshold: z.number().finite().min(0).max(100), unicumThreshold: z.number().finite().min(0).max(100),
  minUnicumBattles: z.number().int().min(0).max(1000000), minApeBattles: z.number().int().min(0).max(1000000),
  weights: z.object({ solo: z.number().finite().min(0).max(10000), div2: z.number().finite().min(0).max(10000), div3: z.number().finite().min(0).max(10000), shipMax: z.number().finite().min(0).max(100), shipBattles: z.number().int().min(0).max(100000) }).refine(v => v.solo + v.div2 + v.div3 > 0, '三种账号模式的权重不能全部为零'),
  textTemplate: z.string().max(4000), excludeSelf: z.boolean(),
}).refine(v => v.apeThreshold < v.unicumThreshold, '高手阈值必须高于海猴阈值')

const LEGACY_DEFAULT_TEXT_TEMPLATE = '我方精英：{AllyUnicumList}；待提升：{AllyApeList}。敌方精英：{EnemyUnicumList}；待提升：{EnemyApeList}。'

export const DEFAULT_SETTINGS: Settings = {
  gamePath: '', region: 'ASIA', secondaryRegion: 'EU', secondaryEnabled: false,
  api: 'VORTEX', wgApplicationId: DEFAULT_API_CONFIG.wgApplicationId,
  theme: 'system', winrate: 'account', showNames: true, autoQuery: true, retryAttempts: 2, cacheMinutes: 15,
  lightPalette: 'graphite', darkPalette: 'graphite',
  apeThreshold: 47, unicumThreshold: 58, minUnicumBattles: 500, minApeBattles: 0,
  weights: { solo: 5, div2: 2, div3: 1, shipMax: 20, shipBattles: 60 },
  textTemplate: '我方上等马：{AllyUnicumList}。我方下等马：{AllyApeList}。我方隐藏马：{AllyHiddenList}。敌方上等马：{EnemyUnicumList}。敌方下等马：{EnemyApeList}。敌方隐藏马：{EnemyHiddenList}。',
  excludeSelf: false,
}
export function normalizeSettings(value: unknown): Settings {
  const migrated = value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value } as Record<string, unknown> : null
  if (migrated) {
    if (migrated.api === 'WG_PROXY') migrated.api = 'WG_PUBLIC'
    if (migrated.region === 'CN') migrated.region = 'AUTO'
    if (migrated.secondaryRegion === 'CN') { migrated.secondaryRegion = DEFAULT_SETTINGS.secondaryRegion; migrated.secondaryEnabled = false }
  }
  const result = settingsSchema.safeParse(migrated ?? value)
  if (!result.success) return structuredClone(DEFAULT_SETTINGS)
  if (result.data.textTemplate === LEGACY_DEFAULT_TEXT_TEMPLATE) result.data.textTemplate = DEFAULT_SETTINGS.textTemplate
  return result.data
}
export const fileSchema = z.object({ name: z.string().min(1).max(260), base64: z.string().min(1).max(6_000_000) })
export const watchSchema = z.object({ region: z.enum([...SUPPORTED_REGIONS, 'CN']), accountId: z.string().regex(/^[\w-]{1,40}$/), name: z.string().min(1).max(100), status: z.enum(['positive', 'negative', 'suspected']).nullable(), note: z.string().max(500).optional() })
export const querySchema = z.object({ force: z.boolean().optional(), failedOnly: z.boolean().optional() })
