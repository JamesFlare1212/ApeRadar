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
import { faRotateRight, faArrowRight, faBinoculars, faClockRotateLeft, faUsers, faGear, faCircleQuestion, faFolderOpen, faStar, faShieldHalved, faCopy, faUpload, faSliders, faPalette, faPlug, faFont, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { Icon } from './components/Icon.js'
import { BrandMark } from './components/layout/BrandMark.js'
import { AppTitleBar } from './components/layout/AppTitleBar.js'
import type { AppState, WatchInput } from '@aperadar/shared/types'
import { MODE_LABELS } from '@aperadar/shared/types'
import { formatPercent, generateOutput, winrate, weightedWinrate } from '@aperadar/shared/statistics'
import { bridge, filePayload } from './lib/bridge.js'
import { cacheAppearance, useAppearance } from './lib/appearance.js'
import { useSidebarPreference } from './hooks/useSidebarPreference.js'
import { SETTINGS_SECTIONS, type SettingsSection } from './lib/settingsNavigation.js'
import { Badge, Button, EmptyState, Modal, Notice } from './components/ui.js'
import { PlayerDetail } from './components/battle/PlayerDetail.js'
import { UpdateNotice } from './components/updates/UpdateNotice.js'
const OverviewPage = lazy(() => import('./routes/OverviewPage.js').then(module => ({ default: module.OverviewPage })))
const SettingsPage = lazy(() => import('./routes/SettingsPage.js').then(module => ({ default: module.SettingsPage })))
const HistoryPage = lazy(() => import('./routes/HistoryPage.js').then(module => ({ default: module.HistoryPage })))
const WatchlistPage = lazy(() => import('./routes/WatchlistPage.js').then(module => ({ default: module.WatchlistPage })))
const HelpPage = lazy(() => import('./routes/HelpPage.js').then(module => ({ default: module.HelpPage })))

type Page = 'overview' | 'history' | 'watchlist' | 'settings' | 'help'
const pages = { overview: { title: '海猴雷达', description: '每一位舰长，一目了然。', icon: faBinoculars }, history: { title: '对局历史', description: '重访海域，回看每一场阵容。', icon: faClockRotateLeft }, watchlist: { title: '关注名单', description: '记住那些值得留意的舰长。', icon: faUsers }, settings: { title: '偏好设置', description: '按你的方式，整理每一份战局情报。', icon: faGear }, help: { title: '使用指南', description: '从连接游戏到读懂阵容。', icon: faCircleQuestion } }
const currentPage = (): Page => { const key = location.hash.replace('#/', '').split('/')[0] ?? ''; return Object.hasOwn(pages, key) ? key as Page : 'overview' }
function exportCsv(filename: string, rows: (string | number | null)[][]) {
  const text = '\uFEFF' + rows.map(row => row.map(value => { let item = String(value ?? ''); if (/^[=+@\-\t\r]/.test(item)) item = "'" + item; return `"${item.replace(/"/g, '""')}"` }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const currentSettingsSection = (): SettingsSection => { const key = location.hash.split('/')[2] ?? 'appearance'; return Object.hasOwn(SETTINGS_SECTIONS, key) ? key as SettingsSection : 'appearance' }
const settingsIcons = { general: faSliders, appearance: faPalette, connection: faPlug, ratings: faShieldHalved, text: faFont, about: faCircleInfo }

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<Page>(currentPage)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(currentSettingsSection)
  const [connectionError, setConnectionError] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [outputOpen, setOutputOpen] = useState(false), [output, setOutput] = useState('')
  const [dragging, setDragging] = useState(false), [importing, setImporting] = useState(false)
  const sidebar = useSidebarPreference()
  const dark = useAppearance(state?.settings)
  const fileInput = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  function notify(text: string, error = false) { if (error) toast.error(text); else toast.success(text) }
  useEffect(() => {
    let active = true
    void bridge.getState().then(value => { if (active) setState(value) }).catch(error => { if (active) setConnectionError(String(error)) })
    const stop = bridge.onStateChanged(value => { if (active) setState(value) })
    return () => { active = false; stop() }
  }, [])
  useEffect(() => { const onHash = () => { setPage(currentPage()); setSettingsSection(currentSettingsSection()) }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, [])
  useEffect(() => { if (state) heading.current?.focus({ preventScroll: true }) }, [page, settingsSection])
  useEffect(() => { if (state?.monitor.error) notify(state.monitor.error, true) }, [state?.monitor.error])
  useEffect(() => { if (state) cacheAppearance(state.settings) }, [state?.settings.theme, state?.settings.lightPalette, state?.settings.darkPalette])
  useEffect(() => { setSelectedKey(null) }, [state?.battle?.id])
  function navigate(next: Page) { setPage(next); location.hash = next === 'settings' ? '/settings/appearance' : `/${next}`; if (next === 'settings') setSettingsSection('appearance'); window.scrollTo({ top: 0, behavior: 'auto' }) }
  function openSettings(section: SettingsSection) { setPage('settings'); setSettingsSection(section); location.hash = `/settings/${section}`; window.scrollTo({ top: 0, behavior: 'auto' }) }
  async function run(work: () => Promise<AppState | null>, success?: string) {
    try { const next = await work(); if (next) setState(next); if (next && success) notify(success); return next }
    catch (error) { notify(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error), true); return null }
  }
  async function importFile(file: File) {
    setImporting(true)
    try { const payload = await filePayload(file); if (await run(() => bridge.importArena(payload), '阵容已载入')) navigate('overview') }
    catch (error) { notify(String(error), true) }
    finally { setImporting(false) }
  }
  async function openFile() {
    if (bridge.desktop) { setImporting(true); if (await run(() => bridge.openFile())) navigate('overview'); setImporting(false) }
    else fileInput.current?.click()
  }
  async function copyText(text: string) { try { await bridge.copyText(text); notify('已复制到剪贴板') } catch { notify('复制未完成，请手动选择文本后复制', true) } }
  if (!state) return <div className="startup-screen"><BrandMark size={48} /><strong>ApeRadar <span>Next</span></strong>{connectionError ? <><Notice role="alert" variant="destructive" title="工作区连接失败">{connectionError}</Notice><Button onClick={() => location.reload()}>重新连接</Button></> : <><Spinner className="size-6" /><p>正在打开你的工作区…</p></>}</div>
  const battle = state.battle
  const settings = state.settings
  const loading = state.query.status === 'loading'
  const selected = battle?.players.find(p => p.key === selectedKey) ?? null
  const pageInfo = pages[page]

  const onWatch = async (input: WatchInput) => !!await run(() => bridge.setWatch(input))
  function exportBattle() {
    if (!battle) return
    exportCsv(`ApeRadar-${battle.id}.csv`, [['舰长', '区服', '阵营', '舰船', '状态', '账号胜率', '加权胜率', '账号场次', '单船胜率', '单船场次'], ...battle.players.map(p => [settings.showNames ? p.name : '舰长', p.region, p.team === 'ally' ? '我方' : '敌方', p.ship.name, p.status, formatPercent(winrate(p.stats?.overall)), formatPercent(weightedWinrate(p, settings)), p.stats?.overall.battles ?? null, p.stats?.shipAvailable ? formatPercent(winrate(p.stats.ship)) : null, p.stats?.shipAvailable ? p.stats.ship.battles : null])])
    notify('阵容已导出为 CSV')
  }
  return <SidebarProvider open={!sidebar.collapsed} onOpenChange={sidebar.setOpen} style={{ '--sidebar-width': '13rem', '--sidebar-width-icon': '4rem' } as CSSProperties} className={`app-shell ${page === 'settings' ? 'settings-shell' : ''} ${bridge.desktop ? 'desktop-shell' : ''}`} data-sidebar={sidebar.collapsed ? 'collapsed' : 'expanded'} data-app-ready onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true) } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void importFile(file) }}>
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); const content = document.getElementById('main-content'); content?.focus(); content?.scrollIntoView({ block: 'start' }) }}>跳至主要内容</a>
    <input ref={fileInput} type="file" tabIndex={-1} className="sr-only" accept=".json,.wowsreplay" aria-label="导入阵容文件" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = '' }} />
    <AppSidebar settingsMode={page === 'settings'} activeKey={page === 'settings' ? settingsSection : page} state={state} notify={notify} installBlocked={loading}
      items={page === 'settings' ? (Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).map(key => ({ key, title: SETTINGS_SECTIONS[key].title, icon: settingsIcons[key] })) : (['overview', 'history', 'watchlist', 'help'] as const).map(key => ({ key, title: pages[key].title, icon: pages[key].icon }))}
      onSelect={key => { if (page === 'settings') openSettings(key as SettingsSection); else navigate(key as Page) }} onHome={() => navigate('overview')} onSettings={() => navigate('settings')} onConnection={() => openSettings('connection')} />
    <SidebarInset className="min-w-0">
    <AppTitleBar section={page === 'settings' ? '设置' : '工作空间'} title={page === 'settings' ? SETTINGS_SECTIONS[settingsSection].title : pageInfo.title} icon={pageInfo.icon} />
    <div id="main-content" tabIndex={-1} className="main-content"><div className="main-inner"><div className="page-heading"><div><h1 ref={heading} tabIndex={-1}>{page === 'settings' ? SETTINGS_SECTIONS[settingsSection].title : pageInfo.title}</h1><p>{page === 'settings' ? SETTINGS_SECTIONS[settingsSection].description : pageInfo.description}</p></div><div className="page-actions">{page === 'overview' ? <><Button disabled={!battle || loading || importing} onClick={() => { void run(() => bridge.query({ force: true })) }}><Icon icon={faRotateRight} size={17} spin={loading} />重新查询</Button><Button variant="default" busy={importing} onClick={() => { void openFile() }}><Icon icon={faFolderOpen} size={18} />打开阵容</Button></> : page === 'settings' ? <Badge tone="brand"><Icon icon={faShieldHalved} size={13} />本地偏好</Badge> : page === 'watchlist' ? <Badge><Icon icon={faStar} size={13} />{state.watchlist.length} 位已关注</Badge> : null}</div></div>
    {page !== 'settings' && <UpdateNotice onOpen={() => openSettings('about')} />}
    <Suspense fallback={<div className="space-y-4" role="status" aria-label="正在载入工作区"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 w-full" /></div>}>
    {page === 'overview' && <OverviewPage state={state} onPlayer={setSelectedKey} onWatch={input => { void onWatch(input) }} onRetry={() => { void run(() => bridge.query({ failedOnly: true, force: true })) }} onCancel={() => { void run(() => bridge.cancelQuery()) }} onImport={() => { void openFile() }} onExport={exportBattle} onSummary={() => { if (battle) { setOutput(generateOutput(battle, settings)); setOutputOpen(true) } }} onWinrateChange={winrate => { void run(() => bridge.saveSettings({ ...settings, winrate })) }} />}
    {page === 'history' && <HistoryPage state={state} onLoad={id => { void run(() => bridge.loadBattle(id)).then(result => { if (result) navigate('overview') }) }} onDemo={() => { void run(() => bridge.loadDemo()).then(result => { if (result) navigate('overview') }) }} onExport={() => { exportCsv('ApeRadar-history.csv', [['时间', '海域', '模式', '区服', '人数', '公开人数', '我方均值', '敌方均值'], ...state.history.map(b => [b.startedAt, b.map, MODE_LABELS[b.mode] ?? b.mode, b.region, b.playerCount, b.readyCount, formatPercent(b.allyWinrate), formatPercent(b.enemyWinrate)])]); notify('历史记录已导出') }} />}
    {page === 'watchlist' && <WatchlistPage state={state} onWatch={onWatch} />}
    {page === 'settings' && <SettingsPage state={state} section={settingsSection} onSave={async next => !!await run(() => bridge.saveSettings(next))} notify={notify} />}
    {page === 'help' && <HelpPage onImport={() => { void openFile() }} onSettings={() => navigate('settings')} />}
    </Suspense>
    <footer className="app-footer"><span><Icon icon={faShieldHalved} size={13} />本地存储 · 由你掌控</span><span>船舶资料 {state.shipVersion}<i>·</i>ApeRadar Next {appPackage.version}</span><Button variant="ghost" onClick={() => { void run(() => bridge.loadDemo()).then(() => navigate('overview')) }}>载入示例对局<Icon icon={faArrowRight} size={12} /></Button></footer></div></div></SidebarInset>
    <PlayerDetail key={selected?.key ?? 'none'} player={selected} settings={settings} watchlist={state.watchlist} onClose={() => setSelectedKey(null)} onWatch={input => { void onWatch(input) }} onCopy={text => { void copyText(text) }} onProfile={player => { if (player.accountId) void bridge.openProfile({ accountId: player.accountId, region: player.region, name: player.name }).catch(error => notify(String(error), true)) }} />
    <Modal open={outputOpen} onOpenChange={setOutputOpen} title="对局文字摘要" description="可编辑后手动复制。应用不会自动发送聊天消息。"><Field><FieldLabel htmlFor="battle-summary">对局摘要内容</FieldLabel><Textarea id="battle-summary" className="output-textarea" rows={6} aria-describedby="battle-summary-description" value={output} onChange={e => setOutput(e.target.value)} maxLength={30000} /><FieldDescription id="battle-summary-description">{output.length} 个字符 · 名单使用当前胜率口径与隐私设置</FieldDescription></Field><DialogFooter className="dialog-footer"><Button onClick={() => setOutputOpen(false)}>关闭</Button><Button variant="default" onClick={() => { void copyText(output) }}><Icon icon={faCopy} size={16} />复制摘要</Button></DialogFooter></Modal>
    <Toaster theme={dark ? 'dark' : 'light'} closeButton position="bottom-right" duration={5000} />
    {dragging && <div className="drop-overlay"><EmptyState icon={<Icon icon={faUpload} size={45} />} title="松开文件，载入阵容">支持 tempArenaInfo.json 和 .wowsreplay</EmptyState></div>}
  </SidebarProvider>
}
