import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { readCatalog } from './arena.ts'
import { RadarDatabase } from './database.ts'
import { RadarService } from './service.ts'
import { message } from './api.ts'
import type { FilePayload, QueryOptions, WatchInput } from '@aperadar/shared/types'
import { initialUpdateState } from '@aperadar/shared/updates'
import appPackage from '../../../package.json'
import { loadApiConfig } from './config.ts'

export async function createDevApi(catalogPath: string, dataDirectory: string, configFile: string) {
  const runtimeConfig = await loadApiConfig(configFile)
  const service = new RadarService(new RadarDatabase(path.join(dataDirectory, 'aperadar.sqlite')), await readCatalog(catalogPath), undefined, {}, runtimeConfig)
  const clients = new Set<ServerResponse>()
  service.on('state', state => { const data = `data: ${JSON.stringify(state)}\n\n`; for (const response of clients) response.write(data) })
  service.startHealthChecks()
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) { next(); return }
    const origin = req.headers.origin
    const expectedHost = req.headers.host ?? ''
    try {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(expectedHost) || (origin && new URL(origin).host !== expectedHost)) { res.writeHead(403).end(); return }
      if (req.method === 'GET' && req.url === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        clients.add(res); res.write(`data: ${JSON.stringify(service.state())}\n\n`)
        req.on('close', () => clients.delete(res)); return
      }
      if (req.method === 'GET' && req.url === '/api/state') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(service.state())); return }
      if (req.method !== 'POST' || req.headers['x-aperadar-client'] !== 'local') { res.writeHead(403).end(); return }
      let raw = ''
      for await (const chunk of req) { raw += String(chunk); if (Buffer.byteLength(raw) > 6_100_000) { res.writeHead(413).end(); return } }
      const input = raw ? JSON.parse(raw) as unknown : undefined
      let result
      switch (req.url) {
        case '/api/updates':
        case '/api/updates/check':
        case '/api/updates/download':
        case '/api/updates/install':
          result = initialUpdateState(appPackage.version, 'disabled', '浏览器预览不支持应用更新，请在正式桌面版本中检查。'); break
        case '/api/import': result = await service.importArena(input as FilePayload); break
        case '/api/demo': result = service.loadDemo(); break
        case '/api/history': result = service.loadBattle(String((input as { id: string }).id)); break
        case '/api/query': result = await service.query(input as QueryOptions); break
        case '/api/cancel': result = service.cancelQuery(); break
        case '/api/health': result = await service.checkApiHealth(); break
        case '/api/settings': result = service.saveSettings(input); break
        case '/api/watch': result = service.setWatch(input as WatchInput); break
        case '/api/monitor': result = service.setMonitor((input as { enabled: boolean }).enabled); break
        default: res.writeHead(404).end(); return
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(result))
    } catch (error) { if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: message(error) })) }
  }
  return { service, handler, dispose: () => { clients.forEach(res => res.end()); service.dispose() } }
}
