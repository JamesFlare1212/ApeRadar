import { createHash } from 'node:crypto'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Battle, RadarPlayer, Region, SupportedRegion, Settings, Ship, ShipType } from '@aperadar/shared/types'
import { isSupportedRegion } from '@aperadar/shared/types'

const idSchema = z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative().safe()]).transform(String)
const arenaSchema = z.object({
  vehicles: z.array(z.object({ id: z.number().int(), name: z.string().min(1).max(100), relation: z.number().int(), shipId: idSchema })).min(1).max(128),
  matchGroup: z.string().max(100).optional(), dateTime: z.string().max(100).optional(),
  mapName: z.string().max(200).optional(), mapDisplayName: z.string().max(200).optional(),
}).passthrough()
const MAX_JSON = 4 * 1024 * 1024
const MAGIC = Buffer.from([0x12, 0x32, 0x34, 0x11])
export interface ShipCatalog { version: string; date: string; ships: Record<string, { 'name_zh-cn': string; 'name_en-us': string; type: string; tier: number; nation: string }> }
export async function readCatalog(filename: string): Promise<ShipCatalog> { return JSON.parse(await readFile(filename, 'utf8')) as ShipCatalog }
export function getShip(catalog: ShipCatalog, id: string): Ship {
  const ship = catalog.ships[id]
  const types: string[] = ['AirCarrier', 'Battleship', 'Cruiser', 'Destroyer', 'Submarine']
  return { id, name: ship?.['name_zh-cn'] ?? '未知舰船', nameEn: ship?.['name_en-us'] ?? 'Unknown ship', type: types.includes(ship?.type) ? ship.type as ShipType : 'Unknown', tier: ship?.tier ?? 0, nation: ship?.nation ?? 'unknown' }
}
export function parseArenaBytes(bytes: Buffer): unknown {
  let json: Buffer
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(MAGIC)) {
    if (bytes.length < 12) throw new Error('回放文件尚未写入完成，请稍后重试')
    const size = bytes.readUInt32LE(8)
    if (size < 2 || size > MAX_JSON) throw new Error('回放阵容块大小无效（上限 4 MB）')
    if (bytes.length < size + 12) throw new Error('回放文件的阵容块不完整，请稍后重试')
    json = bytes.subarray(12, 12 + size)
  } else {
    if (bytes.length > MAX_JSON) throw new Error('阵容 JSON 文件超过 4 MB 上限')
    json = bytes
  }
  try { return JSON.parse(json.toString('utf8').replace(/^\uFEFF/, '').trim()) as unknown }
  catch { throw new Error('文件不是有效的阵容 JSON 或受支持的 .wowsreplay 回放') }
}
export async function readArenaFile(filename: string): Promise<Buffer> {
  if (!['.json', '.wowsreplay'].includes(path.extname(filename).toLowerCase())) throw new Error('请选择 .json 或 .wowsreplay 文件')
  const file = await open(filename, 'r')
  try {
    const header = Buffer.alloc(12)
    const { bytesRead } = await file.read(header, 0, 12, 0)
    if (bytesRead >= 4 && header.subarray(0, 4).equals(MAGIC)) {
      const size = bytesRead >= 12 ? header.readUInt32LE(8) : 0
      if (size < 2 || size > MAX_JSON) throw new Error('回放阵容块长度无效或尚未写入完成')
      const buffer = Buffer.alloc(size + 12)
      const result = await file.read(buffer, 0, buffer.length, 0)
      if (result.bytesRead !== buffer.length) throw new Error('回放文件尚未写入完成')
      return buffer
    }
    const info = await file.stat()
    if (info.size > MAX_JSON) throw new Error('阵容 JSON 文件超过 4 MB 上限')
    return await file.readFile()
  } finally { await file.close() }
}
export function detectRegion(text: string): SupportedRegion {
  const matches = [...text.matchAll(/Selected realm:\s*([^\r\n]+)/g)]
  const realm = matches.at(-1)?.[1].trim().toUpperCase()
  if (isSupportedRegion(realm)) return realm
  if (realm === 'CN') throw new Error('国服在线查询已停止支持')
  throw new Error('无法自动识别区服，请在设置中手动选择')
}
export async function resolveRegion(settings: Settings): Promise<SupportedRegion> {
  if (settings.region !== 'AUTO') return settings.region
  if (!settings.gamePath) throw new Error('自动识别区服需要设置游戏目录，或手动选择区服')
  let text: string
  try { text = await readFile(path.join(settings.gamePath, 'profile', 'clientrunner.log'), 'utf8') }
  catch { throw new Error('无法读取游戏区服，请在设置中手动选择') }
  return detectRegion(text)
}
function parseDate(value: string | undefined) {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)
  if (match) {
    const [, day, month, year, hour, minute, second] = match.map(Number)
    const date = new Date(year, month - 1, day, hour, minute, second)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && hour < 24 && minute < 60 && second < 60) return date.toISOString()
  }
  if (value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString()
  return new Date().toISOString()
}
export function buildBattle(input: unknown, sourceName: string, settings: Settings, region: Region, catalog: ShipCatalog): Battle {
  const parsed = arenaSchema.safeParse(input)
  if (!parsed.success) throw new Error('阵容格式不匹配：需要包含 name、id、relation、shipId 的 vehicles 列表')
  const arena = parsed.data
  const seen = new Set<string>()
  const players: RadarPlayer[] = arena.vehicles.filter(v => v.id > 30).map(v => {
    const playerRegion = settings.secondaryEnabled && v.relation > 1 ? settings.secondaryRegion : region
    const key = `${playerRegion}:${v.name}:${v.shipId}`
    if (seen.has(key)) return null
    seen.add(key)
    return { key, accountId: null, name: v.name, region: playerRegion, team: v.relation <= 1 ? 'ally' as const : 'enemy' as const, isSelf: v.relation === 0, ship: getShip(catalog, v.shipId), clanTag: '', clanId: null, status: v.name.startsWith(':') ? 'bot' as const : 'pending' as const, stats: null, error: null, fetchedAt: null, cached: false }
  }).filter((v): v is NonNullable<typeof v> => v !== null)
  if (!players.length) throw new Error('阵容中没有可展示的玩家（车辆 id 需大于 30）')
  const id = createHash('sha256').update(JSON.stringify({ date: arena.dateTime ?? '', mode: arena.matchGroup, vehicles: arena.vehicles })).digest('hex').slice(0, 24)
  return { id, sourceName: path.basename(sourceName), isDemo: false, importedAt: new Date().toISOString(), startedAt: parseDate(arena.dateTime), mode: arena.matchGroup ?? 'pvp', map: arena.mapDisplayName ?? arena.mapName ?? '未知海域', players }
}
export async function latestArena(gamePath: string): Promise<{ path: string; stamp: string } | null> {
  let best: { path: string; stamp: string; mtime: number } | null = null
  let visited = 0
  async function scan(directory: string, depth: number): Promise<void> {
    if (depth > 7 || visited++ > 600) return
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) await scan(filename, depth + 1)
      else if (entry.name.toLowerCase() === 'temparenainfo.json') {
        try {
          const info = await stat(filename)
          if (!best || info.mtimeMs > best.mtime) best = { path: filename, stamp: `${filename}:${info.mtimeMs}:${info.size}`, mtime: info.mtimeMs }
        } catch { /* a game may replace the file while it is being scanned */ }
      }
    }
  }
  await scan(path.join(gamePath, 'replays'), 0)
  return best
}
