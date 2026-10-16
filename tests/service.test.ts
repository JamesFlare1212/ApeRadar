import { describe, expect, it } from 'vitest'
import { RadarService } from '@aperadar/server/service'
import { RadarDatabase } from '@aperadar/server/database'
import { arena, catalog, fixturePlayer, removeTemp, settings, tempDirectory } from './helpers.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

describe('battle lifecycle', () => {
  it('never sends requests for synthetic demo data', async () => {
    let queries = 0
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, () => ({ query: async () => { queries++ } }))
    try { await service.query(); expect(queries).toBe(0); expect(service.state().battle?.isDemo).toBe(true) } finally { service.dispose() }
  })
  it('retains partial player results and uses the SQLite cache on later queries', async () => {
    let queries = 0
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, () => ({ query: async (players, _signal, onPlayer) => { queries += players.length; for (const p of players) onPlayer({ ...p, accountId: '42', status: 'ready', stats: fixturePlayer().stats, fetchedAt: new Date().toISOString() }) } }))
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      await service.importBytes(Buffer.from(JSON.stringify(arena())), 'arena.json', false)
      await service.query(); expect(queries).toBe(1)
      await service.query(); expect(queries).toBe(1)
      expect(service.state().battle?.players[0].cached).toBe(true)
      expect(service.state().history).toHaveLength(1)
    } finally { service.dispose() }
  })
  it('does not let a delayed result overwrite a newly imported battle', async () => {
    let finish: (() => void) | undefined
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, () => ({ query: (players, _signal, onPlayer) => new Promise<void>(resolve => { finish = () => { players.forEach(p => onPlayer({ ...p, status: 'ready', stats: fixturePlayer().stats })); resolve() } }) }))
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      await service.importBytes(Buffer.from(JSON.stringify(arena('OldCaptain'))), 'old.json', false)
      const old = service.query()
      await service.importBytes(Buffer.from(JSON.stringify(arena('NewCaptain', '16.10.2026 12:01:00'))), 'new.json', false)
      finish?.(); await old
      expect(service.state().battle?.players[0].name).toBe('NewCaptain')
      expect(service.state().battle?.players[0].status).toBe('pending')
    } finally { service.dispose() }
  })
  it('does not interrupt a query when only the displayed winrate changes', async () => {
    let finish: (() => void) | undefined
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, () => ({ query: (players, _signal, onPlayer) => new Promise<void>(resolve => { finish = () => { players.forEach(p => onPlayer({ ...p, status: 'ready', stats: fixturePlayer().stats })); resolve() } }) }))
    try {
      const config = { ...settings(), autoQuery: false }; service.saveSettings(config)
      await service.importBytes(Buffer.from(JSON.stringify(arena())), 'arena.json', false)
      const pending = service.query(); service.saveSettings({ ...config, winrate: 'weighted' })
      expect(service.state().query.status).toBe('loading')
      finish?.(); await pending
      expect(service.state().battle?.players[0].status).toBe('ready')
    } finally { service.dispose() }
  })
  it('automatically imports a real fixture file and stops cleanly', async () => {
    const directory = tempDirectory()
    mkdirSync(path.join(directory, 'replays'), { recursive: true })
    writeFileSync(path.join(directory, 'replays', 'tempArenaInfo.json'), JSON.stringify(arena('AutoCaptain')))
    const service = new RadarService(new RadarDatabase(':memory:'), catalog)
    try {
      service.saveSettings({ ...settings(), autoQuery: false, gamePath: directory })
      const imported = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Monitor fixture timed out')), 3000); service.on('state', state => { if (state.battle?.players[0]?.name === 'AutoCaptain') { clearTimeout(timer); resolve() } }) })
      service.setMonitor(true); await imported
      expect(service.state().battle?.isDemo).toBe(false)
      expect(service.state().history).toHaveLength(1)
      service.setMonitor(false); expect(service.state().monitor.enabled).toBe(false)
    } finally { service.dispose(); removeTemp(directory) }
  })
})
