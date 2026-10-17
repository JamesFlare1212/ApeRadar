import { createHash } from 'node:crypto'
import type { Region, Settings } from '@aperadar/shared/types'
import { DEFAULT_API_CONFIG } from '@aperadar/shared/api-config'
import type { ApiOptions } from './api.ts'
import type { RadarDatabase } from './database.ts'
import { ShipCatalogApi, type ShipCatalog } from './ship-catalog.ts'
import { restoreCatalogNames } from './ship-names.ts'

export class MissingShipLookup {
  private pending = new Map<string, Promise<void>>()
  private retryAfter = new Map<string, number>()
  constructor(private database: RadarDatabase, private catalog: ShipCatalog, private options: ApiOptions = {}) {
    // Bundled entries take precedence over older supplementary API data.
    catalog.ships = restoreCatalogNames({ ships: { ...database.getCatalogShips(), ...catalog.ships } }).ships
  }
  async resolve(ids: string[], region: Region, settings: Settings, signal: AbortSignal): Promise<void> {
    // Lesta's catalog may diverge from WG's; never label RU ships using a WG fallback.
    if (region === 'RU' || region === 'CN' || !settings.wgApplicationId) return
    const config = this.options.config ?? DEFAULT_API_CONFIG
    const source = createHash('sha256').update(`${config.endpoints.wg[region]}:${settings.wgApplicationId}`).digest('hex')
    const key = (id: string) => `${source}:${id}`
    const missing = [...new Set(ids)].filter(id => !this.catalog.ships[id])
    const waiting = missing.flatMap(id => this.pending.get(key(id)) ?? [])
    const fresh = missing.filter(id => !this.pending.has(key(id)) && (this.retryAfter.get(key(id)) ?? 0) <= Date.now())
    if (fresh.length) {
      const request = (async () => {
        try {
          const ships = await new ShipCatalogApi(settings, this.options).getShips(fresh, region, signal)
          signal.throwIfAborted()
          this.database.saveCatalogShips(ships)
          Object.assign(this.catalog.ships, ships)
          for (const id of fresh) this.retryAfter.set(key(id), Date.now() + 60 * 60_000)
        } catch (error) {
          for (const id of fresh) this.retryAfter.set(key(id), Date.now() + 60_000)
          throw error
        } finally { for (const id of fresh) this.pending.delete(key(id)) }
      })()
      for (const id of fresh) this.pending.set(key(id), request)
      waiting.push(request)
    }
    await Promise.all(waiting)
  }
}
