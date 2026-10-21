import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { Icon } from './Icon.js'
import { IconButton } from './ui.js'
import { bridge } from '../lib/bridge.js'

export function AppTitleBar({ section, title, icon }: { section: string; title: string; icon: IconDefinition }) {
  return <header className="app-titlebar">
    <nav className="titlebar-breadcrumb" aria-label="当前位置">
      <Icon icon={icon} size={14} />
      <span className="titlebar-project">{section}</span>
      <span className="titlebar-separator" aria-hidden="true">/</span>
      <strong aria-current="page">{title}</strong>
    </nav>
    {bridge.desktop && <div className="desktop-window-controls" role="group" aria-label="窗口操作">
      <IconButton label="最小化" onClick={() => bridge.windowControl('minimize')}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="M1 6h10" /></svg></IconButton>
      <IconButton label="最大化或还原" onClick={() => bridge.windowControl('maximize')}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx=".5" /></svg></IconButton>
      <IconButton label="关闭应用" className="window-close" onClick={() => bridge.windowControl('close')}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9" /></svg></IconButton>
    </div>}
  </header>
}
