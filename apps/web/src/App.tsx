import { cn } from '@/lib/utils.js'
import { ArrowRight, Binoculars, CircleHelp, Copy, History, Info, Palette, Plug, Settings, ShieldCheck, SlidersHorizontal, Type, Users } from 'lucide-react'
import type { CSSProperties } from 'react'
import appPackage from '../package.json'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar.js'
import { AppSidebar } from './components/layout/AppSidebar.js'
import { Spinner } from './components/ui/spinner.js'
import { DialogFooter } from './components/ui/dialog.js'
import { toast } from 'sonner'
import { Toaster } from './components/ui/sonner.js'
import { Skeleton } from './components/ui/skeleton.js'
import { Textarea } from './components/ui/textarea.js'
import { Field, FieldDescription, FieldLabel } from './components/ui/field.js'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Icon } from './components/Icon.js'
import { BrandMark } from './components/layout/BrandMark.js'
import { AppTitleBar } from './components/layout/AppTitleBar.js'
import type { AppState, WatchInput } from '@aperadar/shared/types'
import { generateOutput } from '@aperadar/shared/statistics'
import { bridge } from './lib/bridge.js'
import { cacheAppearance, useAppearance } from './lib/appearance.js'
import { useSidebarPreference } from './hooks/useSidebarPreference.js'
import { SETTINGS_SECTIONS, type SettingsSection } from './lib/settingsNavigation.js'
import { Button, Modal, Notice } from './components/ui.js'
import { PlayerDetail } from './components/battle/PlayerDetail.js'
import { UpdateNotice } from './components/updates/UpdateNotice.js'
const OverviewPage = lazy(() => import('./routes/OverviewPage.js').then(module => ({ default: module.OverviewPage })))
const SettingsPage = lazy(() => import('./routes/SettingsPage.js').then(module => ({ default: module.SettingsPage })))
const HistoryPage = lazy(() => import('./routes/HistoryPage.js').then(module => ({ default: module.HistoryPage })))
const WatchlistPage = lazy(() => import('./routes/WatchlistPage.js').then(module => ({ default: module.WatchlistPage })))
const HelpPage = lazy(() => import('./routes/HelpPage.js').then(module => ({ default: module.HelpPage })))

type Page = 'overview' | 'history' | 'watchlist' | 'settings' | 'help'
const pages = { overview: { title: '海猴雷达', icon: Binoculars }, history: { title: '对局历史', icon: History }, watchlist: { title: '关注名单', icon: Users }, settings: { title: '偏好设置', icon: Settings }, help: { title: '使用指南', icon: CircleHelp } }
const currentPage = (): Page => { const key = location.hash.replace('#/', '').split('/')[0] ?? ''; return Object.hasOwn(pages, key) ? key as Page : 'overview' }
const currentSettingsSection = (): SettingsSection => { const key = location.hash.split('/')[2] ?? 'appearance'; return Object.hasOwn(SETTINGS_SECTIONS, key) ? key as SettingsSection : 'appearance' }
const settingsIcons = { general: SlidersHorizontal, appearance: Palette, connection: Plug, ratings: ShieldCheck, text: Type, about: Info }
function resetWorkspaceScroll() { document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'instant' }) }

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<Page>(currentPage)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(currentSettingsSection)
  const [connectionError, setConnectionError] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [outputOpen, setOutputOpen] = useState(false), [output, setOutput] = useState('')
  const sidebar = useSidebarPreference()
  const dark = useAppearance(state?.settings)
  const heading = useRef<HTMLHeadingElement>(null)
  function notify(text: string, error = false) { if (error) toast.error(text); else toast.success(text) }
  useEffect(() => {
    let active = true
    void bridge.getState().then(value => { if (active) setState(value) }).catch(error => { if (active) setConnectionError(String(error)) })
    const stop = bridge.onStateChanged(value => { if (active) setState(value) })
    return () => { active = false; stop() }
  }, [])
  useEffect(() => { const onHash = () => { setPage(currentPage()); setSettingsSection(currentSettingsSection()) }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, [])
  useEffect(() => { resetWorkspaceScroll(); if (state) heading.current?.focus({ preventScroll: true }) }, [page, settingsSection])
  useEffect(() => { if (state?.monitor.error) notify(state.monitor.error, true) }, [state?.monitor.error])
  useEffect(() => { if (state) cacheAppearance(state.settings) }, [state?.settings.theme, state?.settings.lightPalette, state?.settings.darkPalette, state?.settings.fontFamily, state?.settings.fontSize])
  useEffect(() => { setSelectedKey(null) }, [state?.battle?.id])
  function navigate(next: Page) { setPage(next); location.hash = next === 'settings' ? '/settings/appearance' : `/${next}`; if (next === 'settings') setSettingsSection('appearance'); resetWorkspaceScroll() }
  function openSettings(section: SettingsSection) { setPage('settings'); setSettingsSection(section); location.hash = `/settings/${section}`; resetWorkspaceScroll() }
  async function run(work: () => Promise<AppState | null>, success?: string) {
    try { const next = await work(); if (next) setState(next); if (next && success) notify(success); return next }
    catch (error) { notify(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error), true); return null }
  }
  async function copyText(text: string) { try { await bridge.copyText(text); notify('已复制到剪贴板') } catch { notify('复制未完成，请手动选择文本后复制', true) } }
  if (!state) return <div className={cn('app-shell startup-screen', bridge.desktop && 'desktop-shell')}><BrandMark size={48} /><strong>ApeRadar <span>Next</span></strong>{connectionError ? <><Notice role="alert" variant="destructive" title="工作区连接失败">{connectionError}</Notice><Button onClick={() => location.reload()}>重新连接</Button></> : <><Spinner className="size-6" /><p>正在打开你的工作区…</p></>}</div>
  const battle = state.battle
  const settings = state.settings
  const loading = state.query.status === 'loading'
  const selected = battle?.players.find(p => p.key === selectedKey) ?? null
  const pageInfo = pages[page]

  const onWatch = async (input: WatchInput) => !!await run(() => bridge.setWatch(input), input.status ? '关注已保存' : '关注已移除')
  return <SidebarProvider open={!sidebar.collapsed} onOpenChange={sidebar.setOpen} style={{ '--sidebar-width': '15rem' } as CSSProperties} className={cn('app-shell', page === 'settings' && 'settings-shell', bridge.desktop && 'desktop-shell')} data-sidebar={sidebar.collapsed ? 'collapsed' : 'expanded'} data-app-ready>
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus({ preventScroll: true }) }}>跳至主要内容</a>
    <AppSidebar settingsMode={page === 'settings'} activeKey={page === 'settings' ? settingsSection : page} state={state} notify={notify} installBlocked={loading}
      items={page === 'settings' ? (Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).map(key => ({ key, title: SETTINGS_SECTIONS[key].title, icon: settingsIcons[key] })) : (['overview', 'history', 'watchlist', 'help'] as const).map(key => ({ key, title: pages[key].title, icon: pages[key].icon }))}
      onSelect={key => { if (page === 'settings') openSettings(key as SettingsSection); else navigate(key as Page) }} onHome={() => navigate('overview')} onSettings={() => navigate('settings')} onConnection={() => openSettings('connection')} />
    <SidebarInset className="min-w-0">
    <AppTitleBar section={page === 'settings' ? '设置' : '工作空间'} title={page === 'settings' ? SETTINGS_SECTIONS[settingsSection].title : pageInfo.title} icon={pageInfo.icon} />
    <div id="main-content" tabIndex={-1} className="main-content"><div className="main-inner">{page === 'settings' ? <div className="page-heading"><div><h1 ref={heading} tabIndex={-1}>{SETTINGS_SECTIONS[settingsSection].title}</h1><p>{SETTINGS_SECTIONS[settingsSection].description}</p></div></div> : <h1 ref={heading} tabIndex={-1} className="sr-only">{pageInfo.title}</h1>}
    {page !== 'settings' && <UpdateNotice onOpen={() => openSettings('about')} />}
    <Suspense fallback={<div className="flex flex-col gap-4" role="status" aria-label="正在载入工作区"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 w-full" /></div>}>
    {page === 'overview' && <OverviewPage state={state} onPlayer={setSelectedKey} onWatch={onWatch} onRefresh={() => { void run(() => bridge.query({ force: true })) }} onRetry={() => { void run(() => bridge.query({ failedOnly: true, force: true })) }} onCancel={() => { void run(() => bridge.cancelQuery()) }} onConnect={() => openSettings('connection')} onSummary={() => { if (battle) { setOutput(generateOutput(battle, settings)); setOutputOpen(true) } }} onWinrateChange={winrate => { void run(() => bridge.saveSettings({ ...settings, winrate })) }} />}
    {page === 'history' && <HistoryPage state={state} onLoad={id => { void run(() => bridge.loadBattle(id)).then(result => { if (result) navigate('overview') }) }} onDemo={() => { void run(() => bridge.loadDemo()).then(result => { if (result) navigate('overview') }) }} />}
    {page === 'watchlist' && <WatchlistPage state={state} onWatch={onWatch} />}
    {page === 'settings' && <SettingsPage state={state} section={settingsSection} onSectionChange={openSettings} onSave={async next => !!await run(() => bridge.saveSettings(next))} notify={notify} />}
    {page === 'help' && <HelpPage onSettings={() => openSettings('connection')} />}
    </Suspense>
    <footer className="app-footer"><span>船舶资料 {state.shipVersion}<i>·</i>ApeRadar Next {appPackage.version}</span><Button variant="ghost" size="sm" onClick={() => { void run(() => bridge.loadDemo()).then(() => navigate('overview')) }}>载入示例对局<Icon data-icon="inline-end" icon={ArrowRight} /></Button></footer></div></div></SidebarInset>
    <PlayerDetail key={selected?.key ?? 'none'} player={selected} settings={settings} watchlist={state.watchlist} onClose={() => setSelectedKey(null)} onWatch={onWatch} onCopy={text => { void copyText(text) }} onProfile={player => { if (player.accountId) void bridge.openProfile({ accountId: player.accountId, region: player.region, name: player.name }).catch(error => notify(String(error), true)) }} />
    <Modal open={outputOpen} onOpenChange={setOutputOpen} title="对局文字摘要" description="可编辑后手动复制。应用不会自动发送聊天消息。"><Field><FieldLabel htmlFor="battle-summary">对局摘要内容</FieldLabel><Textarea id="battle-summary" className="output-textarea" rows={6} aria-describedby="battle-summary-description" value={output} onChange={e => setOutput(e.target.value)} maxLength={30000} /><FieldDescription id="battle-summary-description">{output.length} 个字符 · 名单使用当前胜率口径与隐私设置</FieldDescription></Field><DialogFooter className="dialog-footer"><Button onClick={() => setOutputOpen(false)}>关闭</Button><Button variant="default" onClick={() => { void copyText(output) }}><Icon icon={Copy} />复制摘要</Button></DialogFooter></Modal>
    <Toaster theme={dark ? 'dark' : 'light'} closeButton position="bottom-right" duration={5000} />
  </SidebarProvider>
}
