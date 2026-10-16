import { useState } from 'react'
import { faArrowUpFromBracket, faCircleCheck, faCircleExclamation, faCircleInfo, faCircleNotch, faDownload, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import type { UpdateState } from '@aperadar/shared/updates'
import { bridge } from '../lib/bridge.js'
import { useUpdates } from '../lib/useUpdates.js'
import { Icon } from './Icon.js'
import { Badge, Button } from './ui.js'

export function UpdatePanel({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const { state, error: loadError, run: update } = useUpdates()
  const [busy, setBusy] = useState(false)
  async function run(work: () => Promise<UpdateState>) {
    setBusy(true)
    try { await update(work) } catch (error) { notify(error instanceof Error ? error.message : String(error), true) } finally { setBusy(false) }
  }
  if (!state) return <section className="settings-section update-section" aria-labelledby="update-heading"><h2 id="update-heading" className="settings-section-title">软件更新</h2>{loadError ? <><p className="text-danger update-notice" role="alert">{loadError}</p><Button busy={busy} onClick={() => { void run(() => bridge.getUpdates()) }}><Icon icon={faRotateRight} size={14} />重新读取</Button></> : <p className="settings-description" role="status"><Icon icon={faCircleNotch} size={14} spin /> 正在读取更新状态…</p>}</section>
  const pending = busy || ['checking', 'downloading', 'installing'].includes(state.status)
  const canInstall = state.mode === 'installed' && state.status === 'downloaded'
  const canDownload = state.mode === 'installed' && !!state.availableVersion && (state.status === 'available' || state.status === 'error' && state.errorContext === 'download')
  const labels = { disabled: '自动更新不可用', idle: state.checkedAt ? '已是最新版本' : '等待检查', checking: '正在检查更新', available: '发现新版本', downloading: '正在下载更新', downloaded: state.errorContext === 'install' ? '安装未完成' : '更新已就绪', installing: '正在安装', error: '更新未完成' }
  const statusIcon = pending ? faCircleNotch : state.error ? faCircleExclamation : state.status === 'disabled' ? faCircleInfo : faCircleCheck
  return <section className="settings-section update-section" aria-labelledby="update-heading">
    <div className="settings-panel-title"><div><h2 id="update-heading" className="settings-section-title">软件更新</h2><p className="settings-description">桌面版本会在启动后和使用期间自动检查更新。安装版下载完成后，由你选择安装时机。</p></div><Badge tone={state.error ? 'danger' : 'neutral'}><Icon icon={statusIcon} size={12} spin={pending} />{labels[state.status]}</Badge></div>
    <div className="update-version"><strong>ApeRadar <span>Next</span></strong><span className="numeric">v{state.currentVersion}</span>{state.availableVersion && <Badge tone="brand">新版本 v{state.availableVersion}</Badge>}</div>
    {state.disabledReason && <p className="settings-description update-notice">{state.disabledReason}</p>}
    {state.mode === 'portable' && <p className="settings-description update-notice">当前使用便携版，可检查新版本。发现更新后，请从发布者的正式发布页手动下载和替换程序；应用内下载和安装仅适用于安装版。</p>}
    {state.error && <p className="text-danger update-notice" role="alert">{state.error}</p>}
    {state.notAppliedVersion && <p className="settings-description">上次尝试安装的 v{state.notAppliedVersion} 尚未生效，可以重新检查更新。</p>}
    {state.status === 'downloading' && <div className="update-progress" role="status"><progress max={100} value={state.downloadPercent ?? undefined} aria-label="更新下载进度" /><span>{state.downloadPercent === null ? '下载中…' : `${Math.round(state.downloadPercent)}%`}</span></div>}
    <div className="update-actions"><span className="muted">{state.checkedAt ? `上次检查 ${new Date(state.checkedAt).toLocaleString('zh-CN')}` : '稳定版本通道'}</span>
      {canInstall ? <Button variant="primary" busy={pending} onClick={() => { void run(() => bridge.installUpdate()) }}><Icon icon={faArrowUpFromBracket} size={14} />{state.errorContext === 'install' ? '重试安装' : '重启并安装'}</Button> : canDownload ? <Button variant="primary" busy={pending} onClick={() => { void run(() => bridge.downloadUpdate()) }}><Icon icon={faDownload} size={14} />{state.errorContext === 'download' ? '重试下载' : '下载更新'}</Button> : <Button busy={pending} disabled={state.mode === 'disabled'} onClick={() => { void run(() => bridge.checkUpdates()) }}><Icon icon={faRotateRight} size={14} />{state.status === 'error' && state.errorContext === 'check' ? '重试检查' : '检查更新'}</Button>}
    </div>
  </section>
}
