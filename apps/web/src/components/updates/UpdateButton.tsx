import { Download, RefreshCw, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { bridge } from '../../lib/bridge.js'
import { useUpdates } from '../../hooks/useUpdates.js'
import { Icon } from '../Icon.js'
import { Badge, Button, Hint } from '../ui.js'
import { cn } from '../../lib/utils.js'
import { Progress } from '../ui/progress.js'
import { Spinner } from '../ui/spinner.js'

interface UpdateButtonProps {
  inline?: boolean
  compact?: boolean
  installBlocked?: boolean
  notify: (message: string, error?: boolean) => void
}

export function UpdateButton({ inline = false, compact = false, installBlocked = false, notify }: UpdateButtonProps) {
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
  const icon = downloadIcon ? Download : ready || visualStatus === 'installing' ? RotateCw : RefreshCw
  const detail = loadError || (disabled ? state?.disabledReason
    : blocked ? '更新已就绪，请等待当前查询完成后重启并安装。'
      : state?.error || (available ? `发现新版本 v${state?.availableVersion}。${state?.mode === 'portable' ? '打开下载页面后手动替换便携版。' : '下载完成后，点击“重启并安装”应用更新。'}`
        : ready ? `v${state?.availableVersion} 已下载，点击“重启并安装”应用更新。`
          : status === 'idle' && state?.checkedAt ? '已是最新版本' : label))
  const progress = state?.downloadPercent == null ? null : Math.min(100, Math.max(0, state.downloadPercent))

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

  return <div className={cn(inline ? 'settings-update-action' : 'sidebar-update relative inline-flex shrink-0')}>
    <Hint content={<><p>{detail || label}</p>{state && <p>当前版本 v{state.currentVersion}</p>}</>}><span className="inline-flex" tabIndex={busy || blocked || disabled ? 0 : undefined} aria-disabled={busy || blocked || disabled || undefined} aria-label={busy || blocked || disabled ? `${label}：${detail || label}` : undefined}>
    <Button variant={inline ? 'outline' : 'ghost'} className={cn(inline ? 'settings-update-button' : 'update-button', !inline && compact && 'update-button-compact')}
      aria-label={label} aria-busy={busy}
      disabled={busy || blocked || disabled} onClick={() => { void activate() }}>
      {['checking', 'installing'].includes(visualStatus) && !loadError ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <Icon icon={icon} />}
      {inline && <span>{actionLabel}</span>}
      {!inline && (available || ready) && <Badge tone="brand" className="absolute right-0.5 top-0.5 size-2.5 bg-primary p-0" aria-hidden="true" />}
    </Button>
    </span></Hint>
    {!inline && visualStatus === 'downloading' && <Progress value={progress} className="absolute inset-x-1 bottom-0 h-1 w-auto" aria-label="更新下载进度" />}
    {!inline && <span className="sr-only" role="status" aria-atomic="true">{detail}</span>}
  </div>
}
