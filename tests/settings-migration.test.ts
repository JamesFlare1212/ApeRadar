import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { normalizeSettings, settingsSchema } from '@aperadar/shared/settings'
import { RadarDatabase } from '@aperadar/server/database'
import { removeTemp, settings, tempDirectory } from './helpers.js'

function legacySettings() {
  const { lightPalette: _light, darkPalette: _dark, ...legacy } = settings()
  return { ...legacy, gamePath: 'D:\\Games\\World of Warships', region: 'EU' as const, theme: 'dark' as const, apeThreshold: 43.5, unicumThreshold: 63, minApeBattles: 120, minUnicumBattles: 900, cacheMinutes: 120, weights: { solo: 8, div2: 3, div3: 2, shipMax: 15, shipBattles: 75 }, textTemplate: '自定义：{AllyUnicumList}' }
}

describe('appearance settings migration', () => {
  it('migrates removed routing choices without resetting unrelated preferences or mutating the input', () => {
    const old = { ...legacySettings(), api: 'WG_PROXY', region: 'CN', secondaryRegion: 'CN', secondaryEnabled: true }
    expect(normalizeSettings(old)).toEqual({ ...old, api: 'WG_PUBLIC', region: 'AUTO', secondaryRegion: 'EU', secondaryEnabled: false, lightPalette: 'graphite', darkPalette: 'graphite' })
    expect(old).toMatchObject({ api: 'WG_PROXY', region: 'CN', secondaryRegion: 'CN', secondaryEnabled: true })
    expect(normalizeSettings({ ...legacySettings(), api: 'WG_PROXY' })).toMatchObject({ api: 'WG_PUBLIC', region: 'EU' })
  })
  it('rejects removed endpoints in new settings', () => {
    expect(settingsSchema.safeParse({ ...settings(), api: 'WG_PROXY' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...settings(), region: 'CN' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...settings(), secondaryRegion: 'CN' }).success).toBe(false)
  })
  it('adds default palettes to old settings while preserving every existing value', () => {
    const old = legacySettings()
    expect(normalizeSettings(old)).toEqual({ ...old, lightPalette: 'graphite', darkPalette: 'graphite' })
    expect(settingsSchema.parse(old)).toEqual({ ...old, lightPalette: 'graphite', darkPalette: 'graphite' })
  })
  it('fills only the missing palette and retains an already selected palette', () => {
    const old = { ...legacySettings(), darkPalette: 'ocean' }
    expect(normalizeSettings(old)).toEqual({ ...old, lightPalette: 'graphite' })
  })
  it('opens an actual old SQLite settings row without losing custom paths or rating thresholds', () => {
    const directory = tempDirectory(), filename = path.join(directory, 'legacy.sqlite')
    const old = { ...legacySettings(), api: 'WG_PROXY', region: 'CN', secondaryRegion: 'CN', secondaryEnabled: true }
    const raw = new DatabaseSync(filename)
    raw.exec('CREATE TABLE settings(id INTEGER PRIMARY KEY, json TEXT NOT NULL)')
    raw.prepare('INSERT INTO settings(id,json) VALUES(1,?)').run(JSON.stringify(old))
    raw.close()
    const database = new RadarDatabase(filename)
    try {
      const migrated = database.getSettings()
      expect(migrated).toEqual({ ...old, api: 'WG_PUBLIC', region: 'AUTO', secondaryRegion: 'EU', secondaryEnabled: false, lightPalette: 'graphite', darkPalette: 'graphite' })
      database.saveSettings(migrated)
      expect(database.getSettings()).toEqual(migrated)
    } finally { database.close(); removeTemp(directory) }
  })
})
