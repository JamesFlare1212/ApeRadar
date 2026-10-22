import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faArrowLeft, faArrowRight, faGear, faSliders, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import type { AppState } from '@aperadar/shared/types'
import { Icon } from '../Icon.js'
import { BrandMark } from './BrandMark.js'
import { Badge, Button } from '../ui.js'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.js'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar } from '../ui/sidebar.js'
import { UpdateButton } from '../updates/UpdateButton.js'

interface NavigationItem { key: string; title: string; icon: IconDefinition }

export function AppSidebar({ settingsMode, activeKey, items, state, onSelect, onHome, onSettings, onConnection, notify, installBlocked }: {
  settingsMode: boolean
  activeKey: string
  items: NavigationItem[]
  state: AppState
  onSelect: (key: string) => void
  onHome: () => void
  onSettings: () => void
  onConnection: () => void
  notify: (message: string, error?: boolean) => void
  installBlocked: boolean
}) {
  const { isMobile, setOpenMobile, open } = useSidebar()
  function activate(action: () => void) { action(); if (isMobile) setOpenMobile(false) }
  const health = state.health?.checking ? '检查中' : state.health?.status === 'healthy' ? '连接正常' : state.health?.status === 'unavailable' ? '连接异常' : state.health?.status === 'degraded' ? '部分异常' : '等待检查'
  return <Sidebar id="app-sidebar" collapsible="icon" className="border-sidebar-border">
    <SidebarHeader className="flex-row items-center gap-2 py-4 group-data-[collapsible=icon]:justify-center">
      <Button variant="ghost" className="min-w-0 flex-1 justify-start px-2 group-data-[collapsible=icon]:hidden" aria-label={settingsMode ? '返回工作区' : 'ApeRadar 首页'} onClick={() => activate(onHome)}>
        {settingsMode ? <Icon icon={faSliders} size={24} /> : <BrandMark size={30} />}
        <span className="min-w-0 text-left"><strong className="block text-base">{settingsMode ? '设置' : 'ApeRadar'}</strong><small className="block text-[0.5625rem] tracking-wider text-muted-foreground">{settingsMode ? 'MAKE IT YOURS' : 'BATTLE INTELLIGENCE'}</small></span>
      </Button>
      <SidebarTrigger aria-label={isMobile ? '关闭导航' : open ? '收起侧栏' : '展开侧栏'} aria-expanded={isMobile ? undefined : open} aria-controls="app-sidebar" className="size-8 shrink-0" />
    </SidebarHeader>
    <SidebarContent className="sidebar-main-navigation">
      <SidebarGroup>
        <SidebarGroupLabel>{settingsMode ? '偏好设置' : '工作空间'}</SidebarGroupLabel>
        <nav aria-label={settingsMode ? '设置导航' : '主要导航'}><SidebarMenu className="group-data-[collapsible=icon]:items-center">{items.map(item => <SidebarMenuItem key={item.key}>
          <SidebarMenuButton type="button" isActive={activeKey === item.key} aria-current={activeKey === item.key ? 'page' : undefined} aria-label={item.title} tooltip={item.title} className="h-10" onClick={() => activate(() => onSelect(item.key))}>
            <Icon icon={item.icon} size={18} /><span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>)}</SidebarMenu></nav>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="gap-2 pb-3 group-data-[collapsible=icon]:items-center">
      {!settingsMode && <div className="space-y-3 group-data-[collapsible=icon]:hidden">
        <Button variant="ghost" className="w-full justify-start px-2 text-xs" onClick={() => activate(onConnection)}><Icon icon={faWaveSquare} size={15} /><span>API {health}</span><Badge className={`ml-auto size-2 p-0 ${state.health?.status === 'healthy' ? 'bg-success' : state.health?.status === 'unavailable' ? 'bg-danger' : 'bg-muted-foreground'}`} aria-hidden="true" /></Button>
        {state.monitor.error && <Alert className="game-connection" variant="destructive"><AlertTitle>自动监测异常</AlertTitle><AlertDescription><p>{state.monitor.error}</p><Button variant="link" className="h-auto p-0 text-xs" onClick={() => activate(onConnection)}>检查游戏目录<Icon icon={faArrowRight} size={12} /></Button></AlertDescription></Alert>}
      </div>}
      <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:flex-col">
        <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:flex-none"><SidebarMenuItem><SidebarMenuButton type="button" tooltip={settingsMode ? '返回工作区' : '偏好设置'} aria-label={settingsMode ? '返回工作区' : '偏好设置'} onClick={() => activate(settingsMode ? onHome : onSettings)}><Icon icon={settingsMode ? faArrowLeft : faGear} size={18} /><span>{settingsMode ? '返回工作区' : '设置'}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        <UpdateButton compact={!isMobile && !open} notify={notify} installBlocked={installBlocked} />
      </div>
    </SidebarFooter>
  </Sidebar>
}
