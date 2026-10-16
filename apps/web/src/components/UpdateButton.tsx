import { useState } from 'react'
import { faArrowRotateRight, faArrowsRotate, faDownload } from '@fortawesome/free-solid-svg-icons'
import { bridge } from '../lib/bridge.js'
import { useUpdates } from '../lib/useUpdates.js'
import { Icon } from './Icon.js'
import { Button } from './ui.js'

interface UpdateButtonProps {
  inline?: boolean
  installBlocked?: boolean
  notify: (message: string, error?: boolean) => void
}

export function UpdateButton({ inline = false, installBlocked = false, notify }: UpdateButtonProps) {
  const { state, error: loadError, run } = useUpdates()
  const [pending, setPending] = useState(false)
  const status = state?.status ?? 'checking'
  const active = ['checking', 'downloading', 'installing'].includes(status)
  const busy = pending || (!loadError && active)
  const ready = status === 'downloaded'
  const available = status === 'available' || (status === 'error' && state?.errorContext === 'download')
  const blocked = ready && installBlocked
  const disabled = state?.mode === 'disabled'
  const actionLabel = loadError ? '重新读取更新状态'
    : ready || status === 'installing' ? '重启并安装'
      : available || status === 'downloading'
        ? state?.mode === 'portable' ? '打开下载页面' : state?.errorContext === 'download' ? '重试下载' : '下载更新'
        : state?.errorContext === 'check' ? '重试检查' : '检查更新'
  const label = status === 'checking' && !loadError ? '正在检查更新…'
    : status === 'downloading' ? state?.downloadPercent == null ? '正在下载更新…' : `正在下载更新 ${state.downloadPercent}%`
      : status === 'installing' ? '正在重启并安装…' : actionLabel
  const visualStatus = active ? status : pending ? ready ? 'installing' : available ? 'downloading' : 'checking' : available ? 'available' : status
  const downloadIcon = ['available', 'downloading'].includes(visualStatus)
  const icon = downloadIcon ? faDownload : ready || visualStatus === 'installing' ? faArrowRotateRight : faArrowsRotate
  const detail = loadError || (disabled ? state?.disabledReason
    : blocked ? '更新已就绪，请等待当前查询完成后重启并安装。'
      : state?.error || (available ? `发现新版本 v${state?.availableVersion}。${state?.mode === 'portable' ? '打开下载页面后手动替换便携版。' : '下载完成后，点击“重启并安装”应用更新。'}`
        : ready ? `v${state?.availableVersion} 已下载，点击“重启并安装”应用更新。`
          : status === 'idle' && state?.checkedAt ? '已是最新版本' : label))
  const progress = Math.min(100, Math.max(0, state?.downloadPercent ?? 0))

  async function activate() {
    if (busy || blocked || disabled) return
    setPending(true)
    try {
      if (available && state?.mode === 'portable') { await bridge.openUpdateDownload(); return }
      const result = await run(() => !state || loadError ? bridge.getUpdates() : ready ? bridge.installUpdate() : available ? bridge.downloadUpdate() : bridge.checkUpdates())
      if (result.error) notify(`更新未完成：${result.error}`, true)
      else if (result.status === 'idle' && result.checkedAt !== null) notify('已是最新版本')
    } catch (error) { notify(`更新未完成：${error instanceof Error ? error.message : String(error)}`, true) }
    finally { setPending(false) }
  }

  return <div className={inline ? 'settings-update-action' : 'sidebar-update'}>
    <Button variant={inline ? 'secondary' : 'ghost'} className={inline ? 'settings-update-button' : 'update-button'}
      aria-label={label} aria-busy={busy} title={`${label}${detail && detail !== label ? `\n${detail}` : ''}${state ? `\nv${state.currentVersion}` : ''}`}
      disabled={busy || blocked || disabled} onClick={() => { void activate() }}>
      {inline ? <Icon icon={icon} size={16} spin={['checking', 'installing'].includes(visualStatus) && !loadError} /> : <span className="update-glyph" data-state={visualStatus} aria-hidden="true">
        <svg className="update-ring" viewBox="0 0 36 36" fill="none">
          <circle className="update-ring-track" cx="18" cy="18" r="15.5" />
          <circle className={`update-ring-progress${visualStatus === 'downloading' && state?.downloadPercent === null ? ' update-ring-indeterminate fa-spin' : ''}`} cx="18" cy="18" r="15.5" pathLength="100" strokeDasharray="100" strokeDashoffset={visualStatus === 'available' ? 0 : 100 - progress} />
        </svg>
        <span className="update-symbol"><Icon icon={icon} size={18} spin={['checking', 'installing'].includes(visualStatus) && !loadError} /></span>
      </span>}
      {inline && <span>{actionLabel}</span>}
      {!inline && (available || ready) && <span className="update-dot" aria-hidden="true" />}
    </Button>
    {!inline && <span className="sr-only" role="status" aria-atomic="true">{detail}</span>}
  </div>
}
