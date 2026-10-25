import { settingsSchema } from '@aperadar/shared/settings'
import type { Settings } from '@aperadar/shared/types'
import type { SettingsSection } from './settingsNavigation.js'

export interface SettingsValidationIssue {
  paths: string[]
  message: string
  label: string
  id?: string
  section?: SettingsSection
}

const fields: Record<string, { id: string; section: SettingsSection; label: string }> = {
  gamePath: { id: 'game-path', section: 'connection', label: '游戏目录' },
  region: { id: 'region', section: 'connection', label: '主区服' },
  api: { id: 'api-type', section: 'connection', label: '战绩来源' },
  secondaryRegion: { id: 'secondary-region', section: 'connection', label: '敌方区服' },
  cacheMinutes: { id: 'cache-minutes', section: 'connection', label: '缓存时间' },
  retryAttempts: { id: 'retry-attempts', section: 'connection', label: '失败重试次数' },
  fontFamily: { id: 'custom-interface-font', section: 'appearance', label: '自定义字体' },
  fontSize: { id: 'interface-font-size', section: 'appearance', label: '界面字号' },
  winrate: { id: 'rate-mode', section: 'general', label: '默认胜率口径' },
  apeThreshold: { id: 'ape-threshold', section: 'ratings', label: '海猴胜率上限' },
  unicumThreshold: { id: 'elite-threshold', section: 'ratings', label: '精英胜率下限' },
  minApeBattles: { id: 'ape-min', section: 'ratings', label: '海猴最少账号场次' },
  minUnicumBattles: { id: 'elite-min', section: 'ratings', label: '精英最少账号场次' },
  'weights.solo': { id: 'weight-solo', section: 'ratings', label: '单排乘数' },
  'weights.div2': { id: 'weight-div2', section: 'ratings', label: '双排乘数' },
  'weights.div3': { id: 'weight-div3', section: 'ratings', label: '三排乘数' },
  'weights.shipMax': { id: 'ship-max', section: 'ratings', label: '本舰最大占比' },
  'weights.shipBattles': { id: 'ship-battles', section: 'ratings', label: '本舰占比所需场次' },
  textTemplate: { id: 'text-template', section: 'text', label: '摘要模板' },
}

export function getSettingsValidationIssues(settings: Settings): SettingsValidationIssue[] {
  const validation = settingsSchema.safeParse(settings)
  if (validation.success) return []
  return validation.error.issues.map(issue => {
    const path = issue.path.join('.')
    const paths = path === '' ? ['apeThreshold', 'unicumThreshold']
      : path === 'weights' ? ['weights.solo', 'weights.div2', 'weights.div3'] : [path]
    const field = fields[paths[0]]
    return { paths, message: issue.message, label: path === '' ? '胜率分级阈值' : path === 'weights' ? '账号模式权重' : field?.label ?? '设置', id: field?.id, section: field?.section }
  })
}
