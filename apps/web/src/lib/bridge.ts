import type { AppState, RadarBridge } from '@aperadar/shared/types'
import { isSupportedRegion } from '@aperadar/shared/types'
import { UPDATE_RELEASES_URL } from '@aperadar/shared/updates'

async function request<T>(route: string, input?: unknown): Promise<T> {
  const response = await fetch(`/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ApeRadar-Client': 'local' }, body: JSON.stringify(input ?? {}) })
  const value = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(value.error ?? '本地服务暂不可用，请重试')
  return value
}
const web: RadarBridge = {
  desktop: false,
  getUpdates: () => request('updates'),
  checkUpdates: () => request('updates/check'),
  downloadUpdate: () => request('updates/download'),
  installUpdate: () => request('updates/install'),
  openUpdateDownload: async () => { window.open(UPDATE_RELEASES_URL, '_blank', 'noopener,noreferrer') },
  onUpdatesChanged: () => () => {},
  async getState() { const result = await fetch('/api/state'); if (!result.ok) throw new Error('无法连接本地服务，请通过 pnpm dev:web 启动'); return result.json() as Promise<AppState> },
  importArena: file => request('import', file), openFile: async () => null,
  loadDemo: () => request('demo'), loadBattle: id => request('history', { id }),
  query: options => request('query', options), cancelQuery: () => request('cancel'),
  checkApiHealth: () => request('health'),
  saveSettings: settings => request('settings', settings),
  setWatch: input => request('watch', input), chooseGamePath: async () => null,
  discoverGameClients: () => request('game-clients'), inspectGameClient: path => request('game-client', { path }),
  copyText: text => navigator.clipboard.writeText(text),
  async openProfile(player) {
    const domains = { ASIA: 'worldofwarships.asia', NA: 'worldofwarships.com', EU: 'worldofwarships.eu', RU: 'korabli.su' }
    if (!isSupportedRegion(player.region)) throw new Error('此区服已停止支持在线查询')
    if (!/^\d+$/.test(player.accountId)) throw new Error('示例账号没有在线战绩页')
    window.open(`https://profile.${domains[player.region]}/statistics/${player.accountId}/`, '_blank', 'noopener,noreferrer')
  },
  windowControl: () => {},
  onStateChanged(callback) { const events = new EventSource('/api/events'); events.onmessage = event => { try { callback(JSON.parse(event.data) as AppState) } catch { /* incomplete SSE delivery is retried by the browser */ } }; return () => events.close() },
}
export const bridge: RadarBridge = window.aperadar ?? web
export async function filePayload(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 4 * 1024 * 1024 + 12).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return { name: file.name, base64: btoa(binary) }
}
