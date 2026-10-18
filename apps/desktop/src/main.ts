import { app, BrowserWindow, clipboard, dialog, ipcMain, net, protocol, screen, session, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import electronUpdater from 'electron-updater'
import { RadarDatabase } from '@aperadar/server/database'
import { RadarService } from '@aperadar/server/service'
import { readArenaFile, readCatalog } from '@aperadar/server/arena'
import { discoverGameClients } from '@aperadar/server/game-discovery'
import { inspectGameClient } from '@aperadar/server/game-client'
import { DOMAINS, WargamingApi } from '@aperadar/server/api'
import { loadApiConfig } from '@aperadar/server/config'
import { regionSchema } from '@aperadar/shared/settings'
import type { QueryOptions, WatchInput } from '@aperadar/shared/types'
import { UPDATE_RELEASES_URL } from '@aperadar/shared/updates'
import { UpdateController } from './updates/controller'
import { updateConfiguration } from './updates/config'
import { readInstallRecord, writeInstallRecord } from './updates/install-record'

const smoke = process.argv.includes('--smoke-test')
if (smoke || process.env.APERADAR_DATA_DIR) {
  const data = path.resolve(process.env.APERADAR_DATA_DIR ?? '.test-data/desktop')
  mkdirSync(data, { recursive: true })
  app.setPath('userData', data)
}
protocol.registerSchemesAsPrivileged([{ scheme: 'aperadar', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
let window: BrowserWindow | null = null
let service: RadarService | null = null
let updates: UpdateController | null = null
const devUrl = process.env.ELECTRON_RENDERER_URL
if (devUrl && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(devUrl)) throw new Error('Invalid local development renderer URL')

function trusted(event: IpcMainInvokeEvent) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Invalid application sender')
  const url = event.senderFrame.url
  if (devUrl ? new URL(url).origin !== new URL(devUrl).origin : !url.startsWith('aperadar://app/')) throw new Error('Invalid application origin')
}
function handle(channel: string, callback: (input: unknown) => unknown) {
  ipcMain.handle(channel, (event, input: unknown) => { trusted(event); return callback(input) })
}
async function createWindow() {
  const root = app.getAppPath()
  const dataPath = app.getPath('userData')
  const runtimeConfig = await loadApiConfig(app.isPackaged ? path.join(dataPath, 'api-config.json') : path.resolve(root, '../../config/api.json'), { createIfMissing: app.isPackaged })
  const updateConfig = updateConfiguration({
    packaged: app.isPackaged,
    development: smoke || !!devUrl,
    disabled: process.env.APERADAR_DISABLE_AUTO_UPDATE === '1',
    platform: process.platform,
    configured: existsSync(path.join(process.resourcesPath, 'app-update.yml')),
    portable: !!(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR),
  })
  const installRecord = path.join(dataPath, 'update-install.json')
  updates = new UpdateController({
    version: app.getVersion(),
    ...updateConfig,
    engine: updateConfig.mode === 'disabled' ? null : electronUpdater.autoUpdater,
    notAppliedVersion: smoke ? null : await readInstallRecord(installRecord, app.getVersion()),
    emit: state => { if (window && !window.isDestroyed()) window.webContents.send('radar:updates-changed', state) },
    canInstall: () => !!service && service.state().query.status !== 'loading',
    prepareInstall: targetVersion => writeInstallRecord(installRecord, app.getVersion(), targetVersion),
  })
  const catalog = await readCatalog(path.join(root, app.isPackaged ? 'resources' : '../server/resources', 'ships.json'))
  service = new RadarService(new RadarDatabase(path.join(dataPath, 'aperadar.sqlite')), catalog, settings => new WargamingApi(settings, { fetcher: net.fetch as typeof fetch, config: runtimeConfig.config }), { fetcher: net.fetch as typeof fetch }, runtimeConfig)
  const dist = path.join(root, app.isPackaged ? 'dist' : '../web/dist')
  protocol.handle('aperadar', async request => {
    try {
      const url = new URL(request.url)
      const filename = path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
      const relative = path.relative(dist, filename)
      if (url.host !== 'app' || relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(filename).toString())
    } catch { return new Response('Not found', { status: 404 }) }
  })
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  app.setAppUserModelId('org.aperadar.next')
  const area = screen.getPrimaryDisplay().workAreaSize
  window = new BrowserWindow({ width: Math.max(960, Math.min(1480, area.width - 32)), height: Math.max(680, Math.min(1000, area.height - 32)), minWidth: 960, minHeight: 680, show: false, frame: false, backgroundColor: '#f5f7f9', title: 'ApeRadar Next', icon: path.join(root, 'resources', 'icon.png'), autoHideMenuBar: true, webPreferences: { preload: path.join(root, 'dist-electron', 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } })
  const mainWindow = window
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  service.on('state', state => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('radar:changed', state) })
  handle('radar:state', () => service!.state())
  handle('radar:updates', () => updates!.status())
  handle('radar:updates-check', () => updates!.check())
  handle('radar:updates-download', () => updates!.download())
  handle('radar:updates-install', () => updates!.install())
  handle('radar:updates-open-download', () => shell.openExternal(UPDATE_RELEASES_URL))
  handle('radar:import', input => service!.importArena(input as never))
  handle('radar:demo', () => service!.loadDemo())
  handle('radar:history', id => service!.loadBattle(z.string().max(100).parse(id)))
  handle('radar:query', input => service!.query((input ?? {}) as QueryOptions))
  handle('radar:cancel', () => service!.cancelQuery())
  handle('radar:health', () => service!.checkApiHealth())
  handle('radar:game-clients', () => discoverGameClients())
  handle('radar:game-client', input => inspectGameClient(z.string().max(1024).parse(input)))
  handle('radar:settings', input => service!.saveSettings(input))
  handle('radar:watch', input => service!.setWatch(input as WatchInput))
  handle('radar:open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '导入对局阵容', filters: [{ name: '阵容 / 回放', extensions: ['json', 'wowsreplay'] }], properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    return service!.importBytes(await readArenaFile(result.filePaths[0]), result.filePaths[0])
  })
  handle('radar:choose-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择 World of Warships 游戏目录', properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  handle('radar:copy', input => { clipboard.writeText(z.string().max(30000).parse(input)) })
  handle('radar:profile', async input => {
    const player = z.object({ accountId: z.string().regex(/^\d{1,20}$/), region: regionSchema, name: z.string().max(100) }).parse(input)
    await shell.openExternal(`https://profile.${DOMAINS[player.region]}/statistics/${player.accountId}/`)
  })
  handle('radar:window', input => { const action = z.enum(['minimize', 'maximize', 'close']).parse(input); if (action === 'minimize') mainWindow.minimize(); else if (action === 'close') mainWindow.close(); else if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize() })
  window.on('closed', () => { window = null })
  if (!smoke) service.startHealthChecks()
  await window.loadURL(devUrl ?? 'aperadar://app/index.html')
  updates.start()
  if (!smoke) window.show()
  else {
    try {
      let ready = false
      for (let i = 0; i < 30; i++) {
        ready = await mainWindow.webContents.executeJavaScript("!!document.querySelector('[data-app-ready]')") as boolean
        if (ready) break
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      if (!ready) throw new Error('Renderer did not finish loading')
      await mainWindow.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
      await mainWindow.webContents.executeJavaScript("(()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.append(style);return true})()")
      const defaultAppearance = await mainWindow.webContents.executeJavaScript("(async()=>{const api=window.aperadar;const state=await api.getState();const followsSystem=state.settings.theme==='system'&&document.documentElement.classList.contains('dark')===matchMedia('(prefers-color-scheme: dark)').matches;await api.saveSettings({...state.settings,theme:'light'});return followsSystem})()") as boolean
      if (!defaultAppearance) throw new Error('Desktop default theme does not follow the system')
      await new Promise(resolve => setTimeout(resolve, 200))
      await writeFile(path.join(dataPath, 'desktop-light.png'), (await mainWindow.webContents.capturePage()).toPNG())
      const result = await mainWindow.webContents.executeJavaScript(`(async()=>{const api=window.aperadar;const original=await api.getState();const saved=await api.saveSettings({...original.settings,autoQuery:false,theme:'dark'});const demo=await api.loadDemo();await api.setWatch({region:'ASIA',accountId:'demo-1000',name:'Northbound',status:'positive',note:'desktop smoke'});const state=await api.getState();return {bridge:api.desktop,players:demo.battle.players.length,settings:saved.settings.theme,watchPersisted:state.watchlist.some(x=>x.accountId==='demo-1000'),heading:document.querySelector('h1')?.textContent,nodeAccess:typeof window.require};})()`) as Record<string, unknown>
      const sqlite = await readFile(path.join(dataPath, 'aperadar.sqlite'))
      if (result.bridge !== true || result.players !== 24 || result.watchPersisted !== true || result.nodeAccess !== 'undefined' || !sqlite.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw new Error('Desktop integration assertion failed')
      const updateResult = await mainWindow.webContents.executeJavaScript("(async()=>{const state=await window.aperadar.getUpdates();const button=document.querySelector('.sidebar-update button');return {mode:state.mode,version:state.currentVersion,downloadBridge:typeof window.aperadar.openUpdateDownload,control:!!button&&button.disabled};})()") as { mode: string; version: string; downloadBridge: string; control: boolean }
      if (updateResult.mode !== 'disabled' || updateResult.version !== app.getVersion() || updateResult.downloadBridge !== 'function' || !updateResult.control) throw new Error('Desktop update bridge assertion failed')
      await new Promise(resolve => setTimeout(resolve, 400))
      const darkStyle = await mainWindow.webContents.executeJavaScript("({theme:document.documentElement.className,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent'),row:getComputedStyle(document.querySelector('.self-row')).backgroundColor,button:getComputedStyle(document.querySelector('.button-primary')).backgroundColor})")
      await writeFile(path.join(dataPath, 'desktop-dark.png'), (await mainWindow.webContents.capturePage()).toPNG())
      const apiConfigResult = await mainWindow.webContents.executeJavaScript(`(async()=>{
        const api=window.aperadar, original=(await api.getState()).settings;
        location.hash='/settings/connection';
        for(let i=0;i<40&&!document.getElementById('api-type');i++) await new Promise(resolve=>setTimeout(resolve,50));
        const state=await api.getState(), source=document.getElementById('api-type');
        const result={filePath:state.apiConfiguration.filePath,managed:state.apiConfiguration.applicationIdManaged,defaultSource:original.api,selectedSource:source?.value,applicationIdSuffix:state.settings.wgApplicationId.slice(-6),applicationIdFieldRemoved:!document.getElementById('wg-key')&&!document.getElementById('wg-key-help')};
        await api.saveSettings(original); location.hash='/overview';
        return result;
      })()`) as { filePath: string; managed: boolean; defaultSource: string; selectedSource: string; applicationIdSuffix: string; applicationIdFieldRemoved: boolean }
      if (apiConfigResult.filePath !== runtimeConfig.filePath || apiConfigResult.managed !== !!runtimeConfig.config.wgApplicationId || apiConfigResult.defaultSource !== 'WG_PUBLIC' || apiConfigResult.selectedSource !== 'WG_PUBLIC' || !apiConfigResult.applicationIdFieldRemoved) throw new Error('Desktop API configuration assertion failed')
      if (runtimeConfig.config.wgApplicationId && apiConfigResult.applicationIdSuffix !== runtimeConfig.config.wgApplicationId.slice(-6)) throw new Error('Desktop application ID assertion failed')
      const gameFixture = path.join(dataPath, 'game-client')
      for (const directory of ['bin/12345/bin64', 'bin/12345/res', 'profile', 'replays']) mkdirSync(path.join(gameFixture, directory), { recursive: true })
      const executableFixture = Buffer.alloc(128)
      executableFixture.writeUInt16LE(0x5A4D, 0); executableFixture.writeUInt32LE(64, 60); executableFixture.writeUInt32LE(0x00004550, 64); executableFixture.writeUInt16LE(0x8664, 68); executableFixture.writeUInt16LE(0x0002, 86)
      await Promise.all([
        writeFile(path.join(gameFixture, 'WorldOfWarships.exe'), executableFixture),
        writeFile(path.join(gameFixture, 'bin/12345/bin64/WorldOfWarships64.exe'), executableFixture),
        writeFile(path.join(gameFixture, 'bin/12345/res/engine_config.xml'), '<engine_config.xml><customization><currentRealm>WW</currentRealm></customization></engine_config.xml>'),
        writeFile(path.join(gameFixture, 'preferences.xml'), '<preferences.xml><scriptsPreferences><ui><1@fixture>0</1@fixture></ui><net_credentials><active_server>WOWS NA</active_server></net_credentials></scriptsPreferences></preferences.xml>'),
        writeFile(path.join(gameFixture, 'profile/clientrunner.log'), 'Selected realm: na\n'),
      ])
      const originalGameSettings = service!.state().settings
      const gameClientResult = await mainWindow.webContents.executeJavaScript(`(async()=>{
        const api=window.aperadar, original=(await api.getState()).settings;
        await api.saveSettings({...original,gamePath:${JSON.stringify(gameFixture)},region:'AUTO',autoQuery:false});
        const client=await api.inspectGameClient(${JSON.stringify(gameFixture)});
        const invalid=await api.inspectGameClient(${JSON.stringify(dataPath)});
        location.hash='/settings/connection';
        for(let i=0;i<80&&!document.querySelector('.game-region-result.detected');i++) await new Promise(resolve=>setTimeout(resolve,50));
        const discovered=await api.discoverGameClients();
        const monitor=await api.getState();
        const regionVisible=document.querySelector('.game-region-result strong')?.textContent?.includes('NA')===true;
        const pathVisible=document.getElementById('game-path')?.value===${JSON.stringify(gameFixture)};
        location.hash='/overview';
        for(let i=0;i<40&&!document.querySelector('.sidebar-main-navigation');i++) await new Promise(resolve=>setTimeout(resolve,50));
        const result={valid:client.valid,region:client.region.region,installationRealm:client.installationRealm,invalidRejected:!invalid.valid,regionVisible,pathVisible,discoveryBridge:Array.isArray(discovered.clients),waitingForArena:monitor.monitor.enabled&&monitor.monitor.lastFile===null&&monitor.monitor.error===null,quietMonitoring:!document.querySelector('.game-connection')&&typeof api.setMonitor==='undefined'};
        return result;
      })()`) as { valid: boolean; region: string; installationRealm: string; invalidRejected: boolean; regionVisible: boolean; pathVisible: boolean; discoveryBridge: boolean; waitingForArena: boolean; quietMonitoring: boolean }
      if (!gameClientResult.valid || gameClientResult.region !== 'NA' || gameClientResult.installationRealm !== 'WW' || !gameClientResult.invalidRejected || !gameClientResult.regionVisible || !gameClientResult.pathVisible || !gameClientResult.discoveryBridge || !gameClientResult.waitingForArena || !gameClientResult.quietMonitoring) throw new Error('Desktop game-client detection assertion failed')
      service!.saveSettings(originalGameSettings)
      await mainWindow.webContents.executeJavaScript("location.hash='/overview'")
      // Let the restored workspace finish its mount-time IPC requests before exiting.
      await new Promise(resolve => setTimeout(resolve, 400))
      const report = { status: 'passed', result, updates: updateResult, apiConfiguration: apiConfigResult, gameClient: gameClientResult, darkStyle, versions: process.versions, sqliteHeader: sqlite.subarray(0, 16).toString(), dataPath }
      await writeFile(path.join(dataPath, 'smoke-result.json'), JSON.stringify(report, null, 2))
      service?.dispose(); service = null
      app.exit(0)
    } catch (error) { await writeFile(path.join(dataPath, 'smoke-result.json'), JSON.stringify({ status: 'failed', error: String(error) }, null, 2)); app.exit(1) }
  }
}
app.whenReady().then(createWindow).catch(error => { console.error(error); if (!smoke) dialog.showErrorBox('应用启动失败', error instanceof Error ? error.message : String(error)); app.exit(1) })
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { updates?.dispose(); updates = null; service?.dispose(); service = null })
