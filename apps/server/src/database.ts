import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Battle, RadarPlayer, Settings, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { DEFAULT_SETTINGS, normalizeSettings } from '@aperadar/shared/settings'
import { catalogShipSchema, type CatalogShip } from './ship-catalog.ts'

export class RadarDatabase {
  private db: DatabaseSync
  constructor(readonly filename: string) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true })
    this.db = new DatabaseSync(filename)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS battles (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS watchlist (region TEXT NOT NULL, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, PRIMARY KEY(region,account_id));
      CREATE TABLE IF NOT EXISTS statistics_cache (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ship_catalog_cache (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_battles_started ON battles(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cache_expiry ON statistics_cache(expires_at);
      PRAGMA user_version=1;`)
    this.db.prepare('DELETE FROM statistics_cache WHERE expires_at < ?').run(Date.now())
  }
  getSettings(): Settings {
    const row = this.db.prepare('SELECT json FROM settings WHERE id=1').get()
    return row ? normalizeSettings(JSON.parse(String(row.json))) : structuredClone(DEFAULT_SETTINGS)
  }
  saveSettings(settings: Settings) { this.db.prepare('INSERT INTO settings(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(settings)) }
  getBattle(id: string): Battle | null {
    const row = this.db.prepare('SELECT json FROM battles WHERE id=?').get(id)
    return row ? JSON.parse(String(row.json)) as Battle : null
  }
  lastBattle(): Battle | null {
    const row = this.db.prepare("SELECT value FROM metadata WHERE key='current-battle'").get()
    return row ? this.getBattle(String(row.value)) : null
  }
  saveBattle(battle: Battle) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO battles(id,started_at,json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at,json=excluded.json').run(battle.id, battle.startedAt, JSON.stringify(battle))
      this.db.prepare("INSERT INTO metadata(key,value) VALUES('current-battle',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(battle.id)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  listBattles(): Battle[] { return this.db.prepare('SELECT json FROM battles ORDER BY started_at DESC LIMIT 100').all().map(row => JSON.parse(String(row.json)) as Battle) }
  getWatchlist(): WatchEntry[] {
    return this.db.prepare('SELECT * FROM watchlist ORDER BY updated_at DESC').all().map(row => ({ region: row.region, accountId: row.account_id, name: row.name, status: row.status, note: row.note, updatedAt: row.updated_at })) as unknown as WatchEntry[]
  }
  setWatch(input: WatchInput) {
    if (input.status === null) { this.db.prepare('DELETE FROM watchlist WHERE region=? AND account_id=?').run(input.region, input.accountId); return }
    this.db.prepare('INSERT INTO watchlist(region,account_id,name,status,note,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(region,account_id) DO UPDATE SET name=excluded.name,status=excluded.status,note=excluded.note,updated_at=excluded.updated_at').run(input.region, input.accountId, input.name, input.status, input.note ?? '', new Date().toISOString())
  }
  cacheGet(key: string, now = Date.now()): RadarPlayer | null {
    const row = this.db.prepare('SELECT json FROM statistics_cache WHERE key=? AND expires_at>?').get(key, now)
    return row ? { ...JSON.parse(String(row.json)) as RadarPlayer, cached: true } : null
  }
  cacheSet(key: string, player: RadarPlayer, ttlMinutes: number, now = Date.now()) {
    if (!['ready', 'hidden'].includes(player.status) || player.error) return
    this.db.prepare('INSERT INTO statistics_cache(key,expires_at,json) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at,json=excluded.json').run(key, now + ttlMinutes * 60000, JSON.stringify(player))
  }
  getCatalogShips(): Record<string, CatalogShip> {
    const ships: Record<string, CatalogShip> = {}
    for (const row of this.db.prepare('SELECT id,json FROM ship_catalog_cache').all()) {
      try {
        if (/^\d{1,20}$/.test(String(row.id))) ships[String(row.id)] = catalogShipSchema.parse(JSON.parse(String(row.json)))
      } catch { /* Ignore invalid supplementary entries and fetch them again when needed. */ }
    }
    return ships
  }
  saveCatalogShips(ships: Record<string, CatalogShip>) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const statement = this.db.prepare('INSERT INTO ship_catalog_cache(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json')
      for (const [id, ship] of Object.entries(ships)) statement.run(id, JSON.stringify(catalogShipSchema.parse(ship)))
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  close() { this.db.close() }
}
