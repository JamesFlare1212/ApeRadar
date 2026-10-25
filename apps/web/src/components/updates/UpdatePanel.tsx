import { CircleAlert, CircleCheck, ExternalLink, Info } from 'lucide-react'
import { Alert, AlertDescription } from '../ui/alert.js'
import { Spinner } from '../ui/spinner.js'
import { Progress } from '../ui/progress.js'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card.js'
import { Separator } from '../ui/separator.js'
import { useState } from 'react'
import { bridge } from '../../lib/bridge.js'
import { useUpdates } from '../../hooks/useUpdates.js'
import { Icon } from '../Icon.js'
import { Badge, Button } from '../ui.js'
import { UpdateButton } from './UpdateButton.js'

export function UpdatePanel({ notify, installBlocked = false }: { notify: (message: string, error?: boolean) => void; installBlocked?: boolean }) {
  const { state, error: loadError, run } = useUpdates()
  const [reloading, setReloading] = useState(false)
  async function reload() {
    setReloading(true)
    try { await run(() => bridge.getUpdates()) } catch (error) { notify(String(error), true) } finally { setReloading(false) }
  }
  if (!state) return <Card className="update-section" aria-labelledby="update-heading"><CardHeader><CardTitle><h2 id="update-heading">软件更新</h2></CardTitle></CardHeader><CardContent className="flex flex-col gap-4">{loadError ? <><Alert role="alert" variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert><Button busy={reloading} onClick={() => { void reload() }}>重新读取</Button></> : <p className="flex items-center gap-2" role="status"><Spinner aria-hidden="true" />正在读取更新状态…</p>}</CardContent></Card>
  const pending = ['checking', 'downloading', 'installing'].includes(state.status)
  const labels = { disabled: '自动更新不可用', idle: state.checkedAt ? '已是最新版本' : '等待检查', checking: '正在检查更新', available: '发现新版本', downloading: '正在下载更新', downloaded: state.errorContext === 'install' ? '安装未完成' : '更新已就绪', installing: '正在安装', error: '更新未完成' }
  const statusIcon = state.error ? CircleAlert : state.status === 'disabled' ? Info : CircleCheck
  return <Card className="update-section" aria-labelledby="update-heading">
    <CardHeader><CardTitle><h2 id="update-heading">软件更新</h2></CardTitle><CardDescription>桌面版本会在启动后和使用期间自动检查更新。安装版下载完成后，由你选择安装时机。</CardDescription><CardAction><Badge tone={state.error ? 'danger' : 'neutral'}>{pending ? <Spinner aria-hidden="true" /> : <Icon icon={statusIcon} />}{labels[state.status]}</Badge></CardAction></CardHeader>
    <CardContent className="flex flex-col gap-4">
    <div className="update-version"><strong>ApeRadar <span>Next</span></strong><span className="numeric">v{state.currentVersion}</span>{state.availableVersion && <Badge tone="brand">新版本 v{state.availableVersion}</Badge>}</div>
    {state.disabledReason && <Alert role="status"><AlertDescription>{state.disabledReason}</AlertDescription></Alert>}
    {state.mode === 'portable' && <Alert role="status"><AlertDescription>当前使用便携版，可检查新版本。发现更新后，请从发布者的正式发布页手动下载和替换程序；应用内下载和安装仅适用于安装版。</AlertDescription></Alert>}
    {state.mode === 'installed' && state.status === 'available' && <p className="settings-description">下载完成后，点击“重启并安装”应用更新。</p>}
    {state.status === 'downloaded' && installBlocked && <Alert role="status"><AlertDescription>更新已就绪，请等待当前查询完成后重启并安装。</AlertDescription></Alert>}
    {state.error && <Alert role="alert" variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
    {state.notAppliedVersion && <p className="settings-description">上次尝试安装的 v{state.notAppliedVersion} 尚未生效，可以重新检查更新。</p>}
    {state.status === 'downloading' && <div className="update-progress" role="status"><Progress max={100} value={state.downloadPercent} aria-label="更新下载进度" /><span>{state.downloadPercent === null ? '下载中…' : `${Math.round(state.downloadPercent)}%`}</span></div>}
    {(state.error || state.notAppliedVersion) && <Button className="update-download-fallback" onClick={() => { void bridge.openUpdateDownload().catch(error => notify(String(error), true)) }}><Icon icon={ExternalLink} />打开下载页面</Button>}
    </CardContent>
    <Separator />
    <CardFooter className="update-actions"><span className="muted">{state.checkedAt ? `上次检查 ${new Date(state.checkedAt).toLocaleString('zh-CN')}` : '稳定版本通道'}</span>
      <UpdateButton inline notify={notify} installBlocked={installBlocked} />
    </CardFooter>
  </Card>
}
