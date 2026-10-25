import type { LucideIcon } from 'lucide-react'
import { Minus, Square, X } from 'lucide-react'
import { Separator } from '../ui/separator.js'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from '../ui/breadcrumb.js'
import { SidebarTrigger, useSidebar } from '../ui/sidebar.js'
import { Icon } from '../Icon.js'
import { Hint, IconButton } from '../ui.js'
import { bridge } from '../../lib/bridge.js'

export function AppTitleBar({ section, title, icon }: { section: string; title: string; icon: LucideIcon }) {
  const { isMobile, openMobile, open } = useSidebar()
  const toggleLabel = isMobile ? openMobile ? '关闭导航' : '打开导航' : open ? '收起侧栏' : '展开侧栏'
  return <header className="app-titlebar">
    <div className="flex min-w-0 items-center gap-3"><Hint content={toggleLabel}><SidebarTrigger className="titlebar-navigation size-8 shrink-0" aria-label={toggleLabel} aria-expanded={isMobile ? openMobile : open} aria-controls="app-sidebar" /></Hint><Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
      <Breadcrumb aria-label="当前位置" className="min-w-0"><BreadcrumbList className="flex-nowrap text-xs"><BreadcrumbItem className="hidden sm:inline-flex"><Icon icon={icon} /><span>{section}</span></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block" /><BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate font-medium">{title}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    </div>
    {bridge.desktop && <div className="desktop-window-controls" role="group" aria-label="窗口操作">
      <IconButton label="最小化" onClick={() => bridge.windowControl('minimize')}><Icon icon={Minus} /></IconButton>
      <IconButton label="最大化或还原" onClick={() => bridge.windowControl('maximize')}><Icon icon={Square} /></IconButton>
      <IconButton label="关闭应用" className="window-close" onClick={() => bridge.windowControl('close')}><Icon icon={X} /></IconButton>
    </div>}
  </header>
}
