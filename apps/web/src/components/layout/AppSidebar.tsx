import { ArrowLeft, ArrowRight, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppState } from '@aperadar/shared/types'
import { Icon } from '../Icon.js'
import { BrandMark } from './BrandMark.js'
import { Button } from '../ui.js'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.js'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar.js'
import { UpdateButton } from '../updates/UpdateButton.js'

interface NavigationItem { key: string; title: string; icon: LucideIcon }

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
  const { isMobile, setOpenMobile } = useSidebar()
  function activate(action: () => void) { action(); if (isMobile) setOpenMobile(false) }
  const health = state.health
  const hasApiIssue = health?.status === 'degraded' || health?.status === 'unavailable'
  const secondaryKeys = settingsMode ? ['connection', 'about'] : ['help']
  const navigationGroups = [
    { label: settingsMode ? '偏好设置' : '工作空间', items: items.filter(item => !secondaryKeys.includes(item.key)) },
    { label: settingsMode ? '应用' : '支持', items: items.filter(item => secondaryKeys.includes(item.key)) },
  ]

  return <Sidebar id="app-sidebar" variant="sidebar" collapsible="offcanvas" className="app-sidebar p-2">
    <SidebarHeader className="px-2 pt-3 pb-2">
      <SidebarMenu><SidebarMenuItem>
        <SidebarMenuButton type="button" size="lg" tooltip="ApeRadar 首页" aria-label="ApeRadar 首页" className="sidebar-brand" onClick={() => activate(onHome)}>
          <BrandMark size={32} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="truncate text-base font-semibold tracking-tight">ApeRadar <span className="text-muted-foreground">Next</span></strong><span className="truncate text-xs text-muted-foreground">战局情报工作区</span></span>
        </SidebarMenuButton>
      </SidebarMenuItem></SidebarMenu>
    </SidebarHeader>
    <SidebarContent className="sidebar-main-navigation gap-3">
      {navigationGroups.filter(group => group.items.length > 0).map(group => <SidebarGroup key={group.label} className="py-1">
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        <SidebarGroupContent><nav aria-label={`${group.label}导航`}><SidebarMenu>{group.items.map(item => <SidebarMenuItem key={item.key}>
          <SidebarMenuButton type="button" isActive={activeKey === item.key} aria-current={activeKey === item.key ? 'page' : undefined} aria-label={item.title} tooltip={item.title} className="h-10 max-md:h-11" onClick={() => activate(() => onSelect(item.key))}>
            <Icon icon={item.icon} /><span>{item.title}</span>
          </SidebarMenuButton>
          {item.key === 'watchlist' && state.watchlist.length > 0 && <SidebarMenuBadge>{state.watchlist.length}</SidebarMenuBadge>}
        </SidebarMenuItem>)}</SidebarMenu></nav></SidebarGroupContent>
      </SidebarGroup>)}
    </SidebarContent>
    <SidebarFooter className="gap-2 px-2 pt-3 pb-3">
      {hasApiIssue && <Alert className="api-connection" variant="destructive" role="alert"><AlertTitle>{health.status === 'degraded' ? 'API 部分连接异常' : 'API 连接不可用'}</AlertTitle><AlertDescription><p>{health.message || (health.status === 'degraded' ? '部分 API 服务暂时不可用，请检查连接设置。' : 'API 服务暂时无法连接，请检查连接设置。')}</p><Button variant="link" className="h-auto p-0 text-xs" onClick={() => activate(onConnection)}>检查连接设置<Icon data-icon="inline-end" icon={ArrowRight} /></Button></AlertDescription></Alert>}
      {state.monitor.error && <Alert className="game-connection" variant="destructive"><AlertTitle>自动监测异常</AlertTitle><AlertDescription><p>{state.monitor.error}</p><Button variant="link" className="h-auto p-0 text-xs" onClick={() => activate(onConnection)}>检查游戏目录<Icon data-icon="inline-end" icon={ArrowRight} /></Button></AlertDescription></Alert>}
      <div className="flex w-full items-center gap-2">
        <SidebarMenu className="min-w-0 flex-1"><SidebarMenuItem><SidebarMenuButton type="button" tooltip={settingsMode ? '返回工作区' : '偏好设置'} aria-label={settingsMode ? '返回工作区' : '偏好设置'} className="h-10" onClick={() => activate(settingsMode ? onHome : onSettings)}><Icon icon={settingsMode ? ArrowLeft : Settings} /><span>{settingsMode ? '返回工作区' : '设置'}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        <UpdateButton notify={notify} installBlocked={installBlocked} />
      </div>
    </SidebarFooter>
  </Sidebar>
}
