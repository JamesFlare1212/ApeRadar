import type { UpdateState } from '@aperadar/shared/updates'

interface UpdateEnvironment {
  packaged: boolean
  development: boolean
  disabled: boolean
  platform: NodeJS.Platform
  configured: boolean
  portable: boolean
}

export function updateConfiguration(environment: UpdateEnvironment): { mode: UpdateState['mode']; disabledReason: string | null } {
  if (environment.development || !environment.packaged) return { mode: 'disabled', disabledReason: '开发环境不检查应用更新，请使用正式桌面版本。' }
  if (environment.disabled) return { mode: 'disabled', disabledReason: '此设备已通过环境配置关闭应用更新。' }
  if (environment.platform !== 'win32') return { mode: 'disabled', disabledReason: '当前平台尚未提供应用更新。' }
  if (!environment.configured) return { mode: 'disabled', disabledReason: '此构建尚未配置发布源，无法检查应用更新。' }
  return { mode: environment.portable ? 'portable' : 'installed', disabledReason: null }
}
