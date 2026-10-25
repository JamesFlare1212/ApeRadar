import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, QueryOptions, RadarBridge, Settings, WatchInput } from '@aperadar/shared/types'
import type { UpdateState } from '@aperadar/shared/updates'

const api: RadarBridge = {
  desktop: true,
  getUpdates: () => ipcRenderer.invoke('radar:updates'),
  checkUpdates: () => ipcRenderer.invoke('radar:updates-check'),
  downloadUpdate: () => ipcRenderer.invoke('radar:updates-download'),
  installUpdate: () => ipcRenderer.invoke('radar:updates-install'),
  openUpdateDownload: () => ipcRenderer.invoke('radar:updates-open-download'),
  onUpdatesChanged: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state)
    ipcRenderer.on('radar:updates-changed', listener)
    return () => { ipcRenderer.removeListener('radar:updates-changed', listener) }
  },
  getState: () => ipcRenderer.invoke('radar:state'),
  loadDemo: () => ipcRenderer.invoke('radar:demo'),
  loadBattle: (id: string) => ipcRenderer.invoke('radar:history', id),
  query: (options?: QueryOptions) => ipcRenderer.invoke('radar:query', options),
  cancelQuery: () => ipcRenderer.invoke('radar:cancel'),
  checkApiHealth: () => ipcRenderer.invoke('radar:health'),
  saveSettings: (settings: Settings) => ipcRenderer.invoke('radar:settings', settings),
  setWatch: (input: WatchInput) => ipcRenderer.invoke('radar:watch', input),
  chooseGamePath: () => ipcRenderer.invoke('radar:choose-path'),
  discoverGameClients: () => ipcRenderer.invoke('radar:game-clients'),
  inspectGameClient: path => ipcRenderer.invoke('radar:game-client', path),
  copyText: (text: string) => ipcRenderer.invoke('radar:copy', text),
  openProfile: player => ipcRenderer.invoke('radar:profile', player),
  windowControl: action => { void ipcRenderer.invoke('radar:window', action) },
  onStateChanged: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state)
    ipcRenderer.on('radar:changed', listener)
    return () => { ipcRenderer.removeListener('radar:changed', listener) }
  },
}
contextBridge.exposeInMainWorld('aperadar', api)
