import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { normalizeSettings, settingsSchema } from '@aperadar/shared/settings'
import { RadarDatabase } from '@aperadar/server/database'
import { removeTemp, settings, tempDirectory } from './helpers.js'

function legacySettings() {
  const { lightPalette: _light, darkPalette: _dark, fontFamily: _font, fontSize: _size, ...legacy } = settings()
  return { ...legacy, gamePath: 'D:\\Games\\World of Warships', region: 'EU' as const, theme: 'dark' as const, apeThreshold: 43.5, unicumThreshold: 63, minApeBattles: 120, minUnicumBattles: 900, cacheMinutes: 120, weights: { solo: 8, div2: 3, div3: 2, shipMax: 15, shipBattles: 75 }, textTemplate: '自定义：{AllyUnicumList}' }
}

describe('settings migration', () => {
  it('defaults a missing primary region to automatic detection without resetting other settings', () => {
    const { region: _region, ...old } = legacySettings()
    expect(settingsSchema.parse(old)).toMatchObject({ ...old, region: 'AUTO' })
    expect(normalizeSettings(old)).toMatchObject({ ...old, region: 'AUTO' })
    expect(normalizeSettings(legacySettings()).region).toBe('EU')
  })
  it('starts a fresh database with automatic primary-region detection and retains a saved manual selection', () => {
    const database = new RadarDatabase(':memory:')
    try {
      expect(database.getSettings().region).toBe('AUTO')
      database.saveSettings({ ...database.getSettings(), region: 'NA' })
      expect(database.getSettings().region).toBe('NA')
    } finally { database.close() }
  })
  it('adds missing typography fields independently without resetting existing preferences', () => {
    expect(normalizeSettings({ ...legacySettings(), fontFamily: 'MiSans' })).toMatchObject({ fontFamily: 'MiSans', fontSize: 14, apeThreshold: 43.5 })
    expect(normalizeSettings({ ...legacySettings(), fontSize: 20 })).toMatchObject({ fontFamily: '', fontSize: 20, apeThreshold: 43.5 })
  })
  it('validates typography boundaries and preserves literal font names', () => {
    for (const fontSize of [12, 14, 20]) expect(settingsSchema.safeParse({ ...settings(), fontSize }).success).toBe(true)
    for (const fontSize of [11, 21, 14.5, NaN, Infinity]) expect(settingsSchema.safeParse({ ...settings(), fontSize }).success).toBe(false)
    expect(settingsSchema.parse({ ...settings(), fontFamily: '  自定义 Font  ' }).fontFamily).toBe('自定义 Font')
    for (const fontFamily of ['x'.repeat(101), 'bad\nfont', 'bad\u0000font']) expect(settingsSchema.safeParse({ ...settings(), fontFamily }).success).toBe(false)
  })
  it('persists typography through a SQLite close and reopen', () => {
    const directory = tempDirectory(), filename = path.join(directory, 'typography.sqlite')
    let database = new RadarDatabase(filename)
    try {
      const custom = { ...settings(), fontFamily: 'MiSans', fontSize: 18 }
      database.saveSettings(custom)
      database.close()
      database = new RadarDatabase(filename)
      expect(database.getSettings()).toEqual(custom)
    } finally { database.close(); removeTemp(directory) }
  })
  it('migrates removed routing choices without resetting unrelated preferences or mutating the input', () => {
    const old = { ...legacySettings(), api: 'WG_PROXY', region: 'CN', secondaryRegion: 'CN', secondaryEnabled: true }
    expect(normalizeSettings(old)).toEqual({ ...old, api: 'WG_PUBLIC', region: 'AUTO', secondaryRegion: 'EU', secondaryEnabled: false, lightPalette: 'graphite', darkPalette: 'graphite', fontFamily: '', fontSize: 14 })
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
    expect(normalizeSettings(old)).toEqual({ ...old, lightPalette: 'graphite', darkPalette: 'graphite', fontFamily: '', fontSize: 14 })
    expect(settingsSchema.parse(old)).toEqual({ ...old, lightPalette: 'graphite', darkPalette: 'graphite', fontFamily: '', fontSize: 14 })
  })
  it('fills only the missing palette and retains an already selected palette', () => {
    const old = { ...legacySettings(), darkPalette: 'ocean' }
    expect(normalizeSettings(old)).toEqual({ ...old, lightPalette: 'graphite', fontFamily: '', fontSize: 14 })
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
      expect(migrated).toEqual({ ...old, api: 'WG_PUBLIC', region: 'AUTO', secondaryRegion: 'EU', secondaryEnabled: false, lightPalette: 'graphite', darkPalette: 'graphite', fontFamily: '', fontSize: 14 })
      database.saveSettings(migrated)
      expect(database.getSettings()).toEqual(migrated)
    } finally { database.close(); removeTemp(directory) }
  })
})
