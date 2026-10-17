import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { Settings, SupportedRegion } from '@aperadar/shared/types'
import { DEFAULT_API_CONFIG, wgApiUrl } from '@aperadar/shared/api-config'
import { WargamingApi, type ApiOptions } from './api.ts'
import { restoreCatalogNames, restoreCatalogShip } from './ship-names.ts'

const shipId = z.string().regex(/^\d{1,20}$/)
const shipType = z.enum(['AirCarrier', 'Battleship', 'Cruiser', 'Destroyer', 'Submarine'])
export const catalogShipSchema = z.object({
  'name_en-us': z.string().trim().min(1), 'name_zh-cn': z.string().trim().min(1),
  nation: z.string().min(1), tier: z.number().int().min(1).max(11), type: shipType,
})
export const shipCatalogSchema = z.object({
  version: z.string().min(1), date: z.string().regex(/^\d{8}$/), ships: z.record(shipId, catalogShipSchema),
})
export type CatalogShip = z.infer<typeof catalogShipSchema>
export type ShipCatalog = z.infer<typeof shipCatalogSchema>
export type CatalogRegion = Exclude<SupportedRegion, 'RU'>
const apiShipSchema = z.object({
  ship_id: z.number().int().nonnegative().safe(), name: z.string().trim().min(1),
  nation: z.string().min(1), tier: z.number().int().min(1).max(11), type: shipType,
})
type ApiShip = z.infer<typeof apiShipSchema>
const dataSchema = z.record(shipId, apiShipSchema.nullable())
const infoSchema = z.object({ game_version: z.string().min(1), ships_updated_at: z.number().int().positive().max(253402300799) })
const pageSchema = z.object({
  page: z.number().int().positive(), page_total: z.number().int().min(1).max(200),
  total: z.number().int().min(1).max(20000), count: z.number().int().min(1).max(100),
})
const FIELDS = 'ship_id,name,nation,tier,type'

export async function readCatalog(filename: string): Promise<ShipCatalog> {
  return shipCatalogSchema.parse(JSON.parse((await readFile(filename, 'utf8')).replace(/^\uFEFF/, '')))
}

export async function writeCatalog(filename: string, catalog: ShipCatalog): Promise<void> {
  const contents = JSON.stringify(restoreCatalogNames(shipCatalogSchema.parse(catalog)), null, '\t') + '\n'
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, filename)
  } finally { await rm(temporary, { force: true }) }
}

function parseShips(data: unknown): Record<string, ApiShip> {
  const result: Record<string, ApiShip> = {}
  for (const [id, ship] of Object.entries(dataSchema.parse(data))) {
    if (ship === null) continue
    if (id !== String(ship.ship_id)) throw new Error('Ship ID does not match its catalog key')
    result[id] = ship
  }
  return result
}

function bilingualShips(english: Record<string, ApiShip>, chinese: Record<string, ApiShip>): Record<string, CatalogShip> {
  const ships: Record<string, CatalogShip> = {}
  for (const [id, en] of Object.entries(english)) {
    const zh = chinese[id]
    if (!zh) continue
    if (en.tier !== zh.tier || en.type !== zh.type || en.nation !== zh.nation) throw new Error('Ship details changed between language requests')
    ships[id] = restoreCatalogShip({ 'name_en-us': en.name, 'name_zh-cn': zh.name, nation: en.nation, tier: en.tier, type: en.type }, id)
  }
  return ships
}

export class ShipCatalogApi {
  private api: WargamingApi
  constructor(private settings: Settings, private options: ApiOptions = {}) {
    this.api = new WargamingApi(settings, options)
  }
  private json(region: CatalogRegion, method: string, parameters: Record<string, string>, signal: AbortSignal) {
    if (!this.settings.wgApplicationId) throw new Error('A WG Application ID is required to fetch ship details')
    return this.api.json(wgApiUrl(this.options.config ?? DEFAULT_API_CONFIG, this.settings, region, method, parameters), signal)
  }
  async getShips(ids: string[], region: CatalogRegion, signal: AbortSignal): Promise<Record<string, CatalogShip>> {
    const unique = [...new Set(ids.map(id => shipId.parse(id)))]
    const ships: Record<string, CatalogShip> = {}
    for (let offset = 0; offset < unique.length; offset += 100) {
      const batch = unique.slice(offset, offset + 100)
      const languages: Record<string, ApiShip>[] = []
      for (const language of ['en', 'zh-cn']) {
        const response = await this.json(region, 'encyclopedia/ships', { fields: FIELDS, language, ship_id: batch.join(','), limit: '100' }, signal)
        const data = parseShips(response.data)
        if (Object.keys(data).some(id => !batch.includes(id))) throw new Error('Ship response contains an unrequested ID')
        languages.push(data)
      }
      Object.assign(ships, bilingualShips(languages[0], languages[1]))
    }
    return ships
  }
  async updateCatalog(previous: ShipCatalog, region: CatalogRegion, signal: AbortSignal): Promise<ShipCatalog> {
    const info = infoSchema.parse((await this.json(region, 'encyclopedia/info', { fields: 'game_version,ships_updated_at' }, signal)).data)
    const languages: Record<string, ApiShip>[] = []
    for (const language of ['en', 'zh-cn']) {
      const ships: Record<string, ApiShip> = {}
      let pages = 1, total = 0
      for (let page = 1; page <= pages; page++) {
        const response = await this.json(region, 'encyclopedia/ships', { fields: FIELDS, language, limit: '100', page_no: String(page) }, signal)
        const meta = pageSchema.parse(response.meta)
        const data = parseShips(response.data)
        if (meta.page !== page || meta.count !== Object.keys(data).length || (page > 1 && (meta.page_total !== pages || meta.total !== total))) throw new Error('Incomplete or changing ship catalog pagination')
        if (Object.keys(data).some(id => id in ships)) throw new Error('Duplicate ship across catalog pages')
        pages = meta.page_total; total = meta.total
        Object.assign(ships, data)
      }
      if (Object.keys(ships).length !== total) throw new Error('Ship catalog does not match the reported total')
      languages.push(ships)
    }
    const fetched = bilingualShips(languages[0], languages[1])
    if (Object.keys(fetched).length !== Object.keys(languages[0]).length || Object.keys(fetched).length !== Object.keys(languages[1]).length) throw new Error('Ship catalog languages contain different IDs')
    const after = infoSchema.parse((await this.json(region, 'encyclopedia/info', { fields: 'game_version,ships_updated_at' }, signal)).data)
    if (info.game_version !== after.game_version || info.ships_updated_at !== after.ships_updated_at) throw new Error('Ship encyclopedia changed during download; try again')
    return restoreCatalogNames(shipCatalogSchema.parse({
      version: info.game_version,
      date: new Date(info.ships_updated_at * 1000).toISOString().slice(0, 10).replaceAll('-', ''),
      ships: { ...previous.ships, ...fetched },
    }))
  }
}
