import { faArrowRight, faArrowUpFromBracket, faCircleArrowUp, faDownload } from '@fortawesome/free-solid-svg-icons'
import { useUpdates } from '../lib/useUpdates.js'
import { Icon } from './Icon.js'
import { Button } from './ui.js'

export function UpdateNotice({ onOpen }: { onOpen: () => void }) {
  const { state } = useUpdates()
  if (!state || state.mode === 'disabled' || !['available', 'downloading', 'downloaded'].includes(state.status)) return null
  const downloading = state.status === 'downloading'
  const downloaded = state.status === 'downloaded'
  const version = state.availableVersion ? ` v${state.availableVersion}` : ''
  const title = downloaded ? `更新${version}已就绪` : downloading ? `正在下载更新${version}` : `发现新版本${version}`
  const description = state.mode === 'portable' ? '便携版请从发布者的正式发布页手动下载和替换程序。' : downloaded ? '准备好后，在「关于与更新」中重启并安装。' : downloading ? '下载期间可以继续使用工作区。' : '前往「关于与更新」查看并下载。'
  return <aside className="update-banner" aria-label="应用更新" data-status={state.status}>
    <span className="update-banner-icon"><Icon icon={downloaded ? faArrowUpFromBracket : downloading ? faDownload : faCircleArrowUp} size={18} /></span>
    <div className="update-banner-copy"><strong role="status" aria-atomic="true">{title}</strong><span>{description}</span></div>
    {downloading && <div className="update-banner-progress"><progress max={100} value={state.downloadPercent ?? undefined} aria-label="更新下载进度" /><span className="numeric">{state.downloadPercent === null ? '下载中…' : `${Math.round(state.downloadPercent)}%`}</span></div>}
    <Button variant="ghost" className="update-banner-action" onClick={onOpen}>查看更新<Icon icon={faArrowRight} size={13} /></Button>
  </aside>
}
