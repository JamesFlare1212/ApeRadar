import { Progress } from '../ui/progress.js'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.js'
import { faArrowRight, faArrowUpFromBracket, faCircleArrowUp, faDownload } from '@fortawesome/free-solid-svg-icons'
import { useUpdates } from '../../hooks/useUpdates.js'
import { Icon } from '../Icon.js'
import { Button } from '../ui.js'

export function UpdateNotice({ onOpen }: { onOpen: () => void }) {
  const { state } = useUpdates()
  if (!state || state.mode === 'disabled' || !['available', 'downloading', 'downloaded'].includes(state.status)) return null
  const downloading = state.status === 'downloading'
  const downloaded = state.status === 'downloaded'
  const version = state.availableVersion ? ` v${state.availableVersion}` : ''
  const title = downloaded ? `更新${version}已就绪` : downloading ? `正在下载更新${version}` : `发现新版本${version}`
  const description = state.mode === 'portable' ? '便携版请从发布者的正式发布页手动下载和替换程序。' : downloaded ? '准备好后，在「关于与更新」中重启并安装。' : downloading ? '下载期间可以继续使用工作区。' : '前往「关于与更新」查看并下载。'
  return <Alert role="region" className="mb-4 flex flex-wrap items-center gap-3" aria-label="应用更新" data-status={state.status}>
    <Icon icon={downloaded ? faArrowUpFromBracket : downloading ? faDownload : faCircleArrowUp} size={18} />
    <div className="min-w-0 flex-1"><AlertTitle role="status" aria-atomic="true">{title}</AlertTitle><AlertDescription>{description}</AlertDescription></div>
    {downloading && <div className="flex min-w-32 flex-1 items-center gap-2 text-xs"><Progress max={100} value={state.downloadPercent} aria-label="更新下载进度" /><span className="tabular-nums">{state.downloadPercent === null ? '下载中…' : `${Math.round(state.downloadPercent)}%`}</span></div>}
    <Button variant="ghost" size="sm" onClick={onOpen}>查看更新<Icon icon={faArrowRight} size={13} /></Button>
  </Alert>
}
