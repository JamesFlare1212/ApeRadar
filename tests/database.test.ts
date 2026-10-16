import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { RadarDatabase } from '@aperadar/server/database'
import { demo, fixturePlayer, removeTemp, settings, tempDirectory } from './helpers.js'

describe('real SQLite persistence', () => {
  it('persists settings, snapshots and parameterized watch notes across reopen', () => {
    const directory = tempDirectory(), filename = path.join(directory, 'state.sqlite')
    let db = new RadarDatabase(filename)
    try {
      db.saveSettings({ ...settings(), theme: 'dark' }); db.saveBattle(demo())
      db.setWatch({ region: 'ASIA', accountId: '42', name: "Test'Captain", status: 'positive', note: "quote'; DROP TABLE battles; --" })
      db.close(); db = new RadarDatabase(filename)
      expect(db.getSettings().theme).toBe('dark')
      expect(db.lastBattle()?.players).toHaveLength(24)
      expect(db.getWatchlist()[0].note).toContain('DROP TABLE')
      expect(db.listBattles()).toHaveLength(1)
      db.setWatch({ region: 'ASIA', accountId: '42', name: 'TestCaptain', status: null }); expect(db.getWatchlist()).toHaveLength(0)
    } finally { db.close(); removeTemp(directory) }
  })
  it('expires cache entries and never caches a transport failure', () => {
    const db = new RadarDatabase(':memory:')
    try {
      const player = fixturePlayer(); db.cacheSet('player', player, 1, 1000)
      expect(db.cacheGet('player', 2000)?.cached).toBe(true)
      expect(db.cacheGet('player', 61000)).toBeNull()
      db.cacheSet('error', { ...player, status: 'unavailable', error: 'offline' }, 1)
      expect(db.cacheGet('error')).toBeNull()
    } finally { db.close() }
  })
})
