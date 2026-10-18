import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { faRotateRight, faArrowRight, faBinoculars, faClockRotateLeft, faUsers, faGear, faCircleQuestion, faFolderOpen, faStar, faShieldHalved, faCopy, faDownload, faPause, faCircleCheck, faCircleExclamation, faXmark, faMinus, faWindowMaximize, faChevronRight, faWaveSquare, faUpload, faCircleNotch, faSliders, faPalette, faPlug, faFont, faCircleInfo, faArrowLeft, faAnglesLeft, faAnglesRight } from '@fortawesome/free-solid-svg-icons'
import { Icon } from './components/Icon.js'
import { BrandMark } from './components/BrandMark.js'
import type { AppState, WatchInput } from '@aperadar/shared/types'
import { MODE_LABELS } from '@aperadar/shared/types'
import { formatPercent, generateOutput, teamSummary, winrate, weightedWinrate } from '@aperadar/shared/statistics'
import { bridge, filePayload } from './lib/bridge.js'
import { cacheAppearance, useAppearance } from './lib/appearance.js'
import { useSidebarPreference } from './lib/useSidebarPreference.js'
import { SETTINGS_SECTIONS, type SettingsSection } from './lib/settingsNavigation.js'
import { Badge, Button, IconButton, Modal } from './components/ui.js'
import { TeamTable } from './components/TeamTable.js'
import { DistributionChart } from './components/DistributionChart.js'
import { PlayerDetail } from './components/PlayerDetail.js'
import { UpdateNotice } from './components/UpdateNotice.js'
import { UpdateButton } from './components/UpdateButton.js'
const SettingsPage = lazy(() => import('./pages/SettingsPage.js').then(module => ({ default: module.SettingsPage })))
const HistoryPage = lazy(() => import('./pages/LibraryPages.js').then(module => ({ default: module.HistoryPage })))
const WatchlistPage = lazy(() => import('./pages/LibraryPages.js').then(module => ({ default: module.WatchlistPage })))
const HelpPage = lazy(() => import('./pages/LibraryPages.js').then(module => ({ default: module.HelpPage })))

type Page = 'overview' | 'history' | 'watchlist' | 'settings' | 'help'
const pages = { overview: { title: '海猴雷达', description: '每一位舰长，一目了然。', icon: faBinoculars }, history: { title: '对局历史', description: '重访海域，回看每一场阵容。', icon: faClockRotateLeft }, watchlist: { title: '关注名单', description: '记住那些值得留意的舰长。', icon: faUsers }, settings: { title: '偏好设置', description: '按你的方式，整理每一份战局情报。', icon: faGear }, help: { title: '使用指南', description: '从连接游戏到读懂阵容。', icon: faCircleQuestion } }
const currentPage = (): Page => { const key = location.hash.replace('#/', '').split('/')[0] ?? ''; return key in pages ? key as Page : 'overview' }
function exportCsv(filename: string, rows: (string | number | null)[][]) {
  const text = '\uFEFF' + rows.map(row => row.map(value => { let item = String(value ?? ''); if (/^[=+@\-\t\r]/.test(item)) item = "'" + item; return `"${item.replace(/"/g, '""')}"` }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const currentSettingsSection = (): SettingsSection => { const key = location.hash.split('/')[2] ?? 'appearance'; return key in SETTINGS_SECTIONS ? key as SettingsSection : 'appearance' }
const settingsIcons = { general: faSliders, appearance: faPalette, connection: faPlug, ratings: faShieldHalved, text: faFont, about: faCircleInfo }

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<Page>(currentPage)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(currentSettingsSection)
  const [connectionError, setConnectionError] = useState('')
  const [toast, setToast] = useState<{ text: string; error: boolean; id: number } | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [outputOpen, setOutputOpen] = useState(false), [output, setOutput] = useState('')
  const [dragging, setDragging] = useState(false), [importing, setImporting] = useState(false)
  const sidebar = useSidebarPreference()
  useAppearance(state?.settings)
  const fileInput = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  function notify(text: string, error = false) { setToast({ text, error, id: Date.now() }) }
  useEffect(() => {
    let active = true
    void bridge.getState().then(value => { if (active) setState(value) }).catch(error => { if (active) setConnectionError(String(error)) })
    const stop = bridge.onStateChanged(value => { if (active) setState(value) })
    return () => { active = false; stop() }
  }, [])
  useEffect(() => { const onHash = () => { setPage(currentPage()); setSettingsSection(currentSettingsSection()) }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, [])
  useEffect(() => { if (state) heading.current?.focus({ preventScroll: true }) }, [page, settingsSection])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5000); return () => clearTimeout(timer) }, [toast])
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
  if (!state) return <div className="startup-screen"><BrandMark size={48} /><strong>ApeRadar <span>Next</span></strong>{connectionError ? <><p role="alert">{connectionError}</p><Button onClick={() => location.reload()}>重新连接</Button></> : <><Icon icon={faCircleNotch} size={22} spin /><p>正在打开你的工作区…</p></>}</div>
  const battle = state.battle
  const settings = state.settings
  const loading = state.query.status === 'loading'
  const selected = battle?.players.find(p => p.key === selectedKey) ?? null
  const ally = battle ? teamSummary(battle, 'ally', settings) : null
  const enemy = battle ? teamSummary(battle, 'enemy', settings) : null
  const failed = battle?.players.filter(p => ['unavailable', 'not-found'].includes(p.status) || p.error).length ?? 0
  const pageInfo = pages[page]
  const currentIcon = pageInfo.icon
  const sidebarToggle = <IconButton className="sidebar-toggle" label={sidebar.collapsed ? '展开侧栏' : '收起侧栏'} aria-expanded={!sidebar.collapsed} aria-controls="app-sidebar" onClick={sidebar.toggle}><Icon icon={sidebar.collapsed ? faAnglesRight : faAnglesLeft} size={15} /></IconButton>
  const onWatch = async (input: WatchInput) => !!await run(() => bridge.setWatch(input))
  function exportBattle() {
    if (!battle) return
    exportCsv(`ApeRadar-${battle.id}.csv`, [['舰长', '区服', '阵营', '舰船', '状态', '账号胜率', '加权胜率', '账号场次', '单船胜率', '单船场次'], ...battle.players.map(p => [settings.showNames ? p.name : '舰长', p.region, p.team === 'ally' ? '我方' : '敌方', p.ship.name, p.status, formatPercent(winrate(p.stats?.overall)), formatPercent(weightedWinrate(p, settings)), p.stats?.overall.battles ?? null, p.stats?.shipAvailable ? formatPercent(winrate(p.stats.ship)) : null, p.stats?.shipAvailable ? p.stats.ship.battles : null])])
    notify('阵容已导出为 CSV')
  }
  return <div className={`app-shell ${page === 'settings' ? 'settings-shell' : ''} ${bridge.desktop ? 'desktop-shell' : ''}`} data-sidebar={sidebar.collapsed ? 'collapsed' : 'expanded'} data-app-ready onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true) } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void importFile(file) }}>
    <a href="#main-content" className="skip-link">跳至主要内容</a>
    <input ref={fileInput} type="file" className="sr-only" accept=".json,.wowsreplay" aria-label="导入阵容文件" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = '' }} />
    {bridge.desktop && <div className="desktop-window-controls" role="group" aria-label="窗口操作"><IconButton label="最小化" onClick={() => bridge.windowControl('minimize')}><Icon icon={faMinus} size={14} /></IconButton><IconButton label="最大化或还原" onClick={() => bridge.windowControl('maximize')}><Icon icon={faWindowMaximize} size={12} /></IconButton><IconButton label="关闭应用" className="window-close" onClick={() => bridge.windowControl('close')}><Icon icon={faXmark} size={15} /></IconButton></div>}
    {page === 'settings' ? <aside id="app-sidebar" className="sidebar settings-sidebar"><div className="sidebar-header"><button className="brand" onClick={() => navigate('overview')} aria-label="返回工作区"><span className="settings-brand-icon"><Icon icon={faSliders} size={23} /></span><span><strong>设置</strong><small>MAKE IT YOURS</small></span></button>{sidebarToggle}</div><nav aria-label="设置导航">{(Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).map(key => <button className={`nav-item ${settingsSection === key ? 'active' : ''}`} key={key} aria-label={SETTINGS_SECTIONS[key].title} title={SETTINGS_SECTIONS[key].title} aria-current={settingsSection === key ? 'page' : undefined} onClick={() => { setSettingsSection(key); location.hash = `/settings/${key}`; window.scrollTo({ top: 0, behavior: 'auto' }) }}><Icon icon={settingsIcons[key]} size={19} /><span>{SETTINGS_SECTIONS[key].title}</span></button>)}</nav><div className="sidebar-bottom settings-sidebar-footer"><button className="nav-item" aria-label="返回工作区" title="返回工作区" onClick={() => navigate('overview')}><Icon icon={faArrowLeft} size={18} /><span>返回工作区</span></button><UpdateButton notify={notify} installBlocked={loading} /></div></aside> : (
    <aside id="app-sidebar" className="sidebar"><div className="sidebar-header"><button className="brand" onClick={() => navigate('overview')} aria-label="ApeRadar 首页"><BrandMark /><span><strong>ApeRadar<span className="brand-next">NEXT</span></strong><small>BATTLE INTELLIGENCE</small></span></button>{sidebarToggle}</div><div className="sidebar-main-navigation"><nav aria-label="主要导航">{(['overview', 'history', 'watchlist'] as const).map(key => { const item = pages[key]; return <button className={`nav-item ${page === key ? 'active' : ''}`} key={key} onClick={() => navigate(key)} aria-label={item.title} title={item.title} aria-current={page === key ? 'page' : undefined}><Icon icon={item.icon} size={20} /><span>{item.title}</span>{key === 'overview' && battle && <span className="nav-count">{battle.players.length}</span>}{key === 'watchlist' && state.watchlist.length > 0 && <span className="nav-count">{state.watchlist.length}</span>}</button> })}</nav><nav aria-label="应用导航">{(['help'] as const).map(key => { const item = pages[key]; return <button className={`nav-item ${page === key ? 'active' : ''}`} key={key} onClick={() => navigate(key)} aria-label={item.title} title={item.title} aria-current={page === key ? 'page' : undefined}><Icon icon={item.icon} size={20} /><span>{item.title}</span></button> })}</nav></div>
      <div className="sidebar-support"><div className="sidebar-bottom"><button className="api-health-shortcut" onClick={() => openSettings('connection')}><Icon icon={faWaveSquare} size={14} /><span>API {state.health?.checking ? '检查中' : state.health?.status === 'healthy' ? '连接正常' : state.health?.status === 'unavailable' ? '连接异常' : state.health?.status === 'degraded' ? '部分异常' : '等待检查'}</span><span className={`connection-dot ${state.health?.status === 'healthy' ? 'connected' : state.health?.status === 'unavailable' ? 'failed' : ''}`} /></button>{state.monitor.error && <div className="game-connection" role="alert"><span className="connection-dot failed" /><strong>自动监测异常</strong><p>{state.monitor.error}</p><button onClick={() => openSettings('connection')}>检查游戏目录<Icon icon={faArrowRight} size={14} /></button></div>}</div>
      <nav className="sidebar-settings" aria-label="设置"><button className="nav-item" onClick={() => navigate('settings')} aria-label="偏好设置" title="偏好设置"><Icon icon={faGear} size={20} /></button><UpdateButton notify={notify} installBlocked={loading} /></nav></div>
    </aside>
    )}
    <main id="main-content" className="main-content"><div className="main-inner"><div className="breadcrumb"><Icon icon={currentIcon} size={14} /><span>{page === 'settings' ? '设置' : '工作空间'}</span><Icon icon={faChevronRight} size={11} /><strong>{page === 'settings' ? SETTINGS_SECTIONS[settingsSection].title : pageInfo.title}</strong></div><div className="page-heading"><div><h1 ref={heading} tabIndex={-1}>{page === 'settings' ? SETTINGS_SECTIONS[settingsSection].title : pageInfo.title}</h1><p>{page === 'settings' ? SETTINGS_SECTIONS[settingsSection].description : pageInfo.description}</p></div><div className="page-actions">{page === 'overview' ? <><Button disabled={!battle || loading || importing} onClick={() => { void run(() => bridge.query({ force: true })) }}><Icon icon={faRotateRight} size={17} spin={loading} />重新查询</Button><Button variant="primary" busy={importing} onClick={() => { void openFile() }}><Icon icon={faFolderOpen} size={18} />打开阵容</Button></> : page === 'settings' ? <Badge tone="brand"><Icon icon={faShieldHalved} size={13} />本地偏好</Badge> : page === 'watchlist' ? <Badge><Icon icon={faStar} size={13} />{state.watchlist.length} 位已关注</Badge> : null}</div></div>
    {page !== 'settings' && <UpdateNotice onOpen={() => openSettings('about')} />}
    {page === 'overview' && battle && ally && enemy && <>
      {loading && <div className="query-progress" role="status"><span><Icon icon={faCircleNotch} size={16} spin />{state.query.message}</span><progress value={state.query.done} max={state.query.total || 1} /><Button variant="ghost" onClick={() => { void run(() => bridge.cancelQuery()) }}><Icon icon={faPause} size={14} />取消</Button></div>}
      {failed > 0 && !loading && <div className="partial-notice"><Icon icon={faCircleExclamation} size={16} /><span>{failed} 位舰长的数据尚未补齐，其他结果已保留。</span><button onClick={() => { void run(() => bridge.query({ failedOnly: true, force: true })) }}>重试失败数据<Icon icon={faArrowRight} size={14} /></button></div>}
      <div className="roster-toolbar"><div className="flex items-center gap-3"><h2>双方阵容</h2><div className="segmented" role="group" aria-label="胜率显示口径"><button aria-pressed={settings.winrate === 'account'} onClick={() => { if (settings.winrate !== 'account') void run(() => bridge.saveSettings({ ...settings, winrate: 'account' })) }}>账号胜率</button><button aria-pressed={settings.winrate === 'weighted'} onClick={() => { if (settings.winrate !== 'weighted') void run(() => bridge.saveSettings({ ...settings, winrate: 'weighted' })) }}>加权胜率</button></div></div></div>
      <div className="teams-grid">{(['ally', 'enemy'] as const).map(team => <TeamTable key={team} team={team} averageWinrate={team === 'ally' ? ally.winrate : enemy.winrate} players={battle.players.filter(p => p.team === team)} settings={settings} watchlist={state.watchlist} search="" shipFilter="" onPlayer={setSelectedKey} onWatch={input => { void onWatch(input) }} onRetry={() => { void run(() => bridge.query({ failedOnly: true, force: true })) }} querying={loading} />)}</div>
      <div className="roster-actions"><span><InfoIconFallback />当前展示累计随机战战绩 · 隐藏与查询失败分别标记</span><div className="flex gap-2"><Button variant="ghost" onClick={exportBattle}><Icon icon={faDownload} size={16} />导出 CSV</Button><Button onClick={() => { setOutput(generateOutput(battle, settings)); setOutputOpen(true) }}><Icon icon={faCopy} size={16} />生成文字摘要</Button></div></div>
      <div className="bottom-grid"><DistributionChart battle={battle} settings={settings} /></div>
    </>}
    <Suspense fallback={<div className="page-loading" role="status"><Icon icon={faCircleNotch} spin size={20} />正在载入工作区…</div>}>
    {page === 'history' && <HistoryPage state={state} onLoad={id => { void run(() => bridge.loadBattle(id)).then(result => { if (result) navigate('overview') }) }} onDemo={() => { void run(() => bridge.loadDemo()).then(() => navigate('overview')) }} onExport={() => { exportCsv('ApeRadar-history.csv', [['时间', '海域', '模式', '区服', '人数', '公开人数', '我方均值', '敌方均值'], ...state.history.map(b => [b.startedAt, b.map, MODE_LABELS[b.mode] ?? b.mode, b.region, b.playerCount, b.readyCount, formatPercent(b.allyWinrate), formatPercent(b.enemyWinrate)])]); notify('历史记录已导出') }} />}
    {page === 'watchlist' && <WatchlistPage state={state} onWatch={onWatch} />}
    {page === 'settings' && <SettingsPage state={state} section={settingsSection} onSave={async next => !!await run(() => bridge.saveSettings(next))} notify={notify} />}
    {page === 'help' && <HelpPage onImport={() => { void openFile() }} onSettings={() => navigate('settings')} />}
    </Suspense>
    <footer className="app-footer"><span><Icon icon={faShieldHalved} size={13} />本地存储 · 由你掌控</span><span>船舶资料 {state.shipVersion}<i>·</i>ApeRadar Next 3.0</span><button onClick={() => { void run(() => bridge.loadDemo()).then(() => navigate('overview')) }}>载入示例对局<Icon icon={faArrowRight} size={12} /></button></footer></div></main>
    <PlayerDetail key={selected?.key ?? 'none'} player={selected} settings={settings} watchlist={state.watchlist} onClose={() => setSelectedKey(null)} onWatch={input => { void onWatch(input) }} onCopy={text => { void copyText(text) }} onProfile={player => { if (player.accountId) void bridge.openProfile({ accountId: player.accountId, region: player.region, name: player.name }).catch(error => notify(String(error), true)) }} />
    <Modal open={outputOpen} onOpenChange={setOutputOpen} title="对局文字摘要" description="可编辑后手动复制。应用不会自动发送聊天消息。"><textarea className="input output-textarea" rows={6} aria-label="对局摘要内容" value={output} onChange={e => setOutput(e.target.value)} maxLength={30000} /><p className="text-xs muted">{output.length} 个字符 · 名单使用当前胜率口径与隐私设置</p><div className="dialog-footer"><Button onClick={() => setOutputOpen(false)}>关闭</Button><Button variant="primary" onClick={() => { void copyText(output) }}><Icon icon={faCopy} size={16} />复制摘要</Button></div></Modal>
    {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <Icon icon={faCircleExclamation} size={19} /> : <Icon icon={faCircleCheck} size={19} />}<span>{toast.text}</span><IconButton label="关闭提示" onClick={() => setToast(null)}><Icon icon={faXmark} size={15} /></IconButton></div>}
    {dragging && <div className="drop-overlay"><Icon icon={faUpload} size={45} /><h2>松开文件，载入阵容</h2><p>支持 tempArenaInfo.json 和 .wowsreplay</p></div>}
  </div>
}
function InfoIconFallback() { return <span className="tiny-info" aria-hidden="true">i</span> }
