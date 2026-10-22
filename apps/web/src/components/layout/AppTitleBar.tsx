import { Separator } from '../ui/separator.js'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from '../ui/breadcrumb.js'
import { SidebarTrigger, useSidebar } from '../ui/sidebar.js'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { Icon } from '../Icon.js'
import { IconButton } from '../ui.js'
import { bridge } from '../../lib/bridge.js'

export function AppTitleBar({ section, title, icon }: { section: string; title: string; icon: IconDefinition }) {
  const { isMobile, openMobile } = useSidebar()
  return <header className="app-titlebar">
    <div className="flex min-w-0 items-center gap-3">{isMobile && <><SidebarTrigger className="titlebar-navigation size-8 shrink-0" aria-label={openMobile ? '关闭导航' : '打开导航'} aria-expanded={openMobile} aria-controls="app-sidebar" /><Separator orientation="vertical" className="h-4" /></>}
      <Breadcrumb aria-label="当前位置" className="min-w-0"><BreadcrumbList className="flex-nowrap text-xs"><BreadcrumbItem className="hidden sm:inline-flex"><Icon icon={icon} size={14} /><span>{section}</span></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block" /><BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate font-medium">{title}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    </div>
    {bridge.desktop && <div className="desktop-window-controls" role="group" aria-label="窗口操作">
      <IconButton label="最小化" onClick={() => bridge.windowControl('minimize')}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="M1 6h10" /></svg></IconButton>
      <IconButton label="最大化或还原" onClick={() => bridge.windowControl('maximize')}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx=".5" /></svg></IconButton>
      <IconButton label="关闭应用" className="window-close" onClick={() => bridge.windowControl('close')}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9" /></svg></IconButton>
    </div>}
  </header>
}
