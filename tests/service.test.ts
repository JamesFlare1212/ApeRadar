import { describe, expect, it } from 'vitest'
import { RadarService } from '@aperadar/server/service'
import { RadarDatabase } from '@aperadar/server/database'
import { arena, catalog, createGameClient, fixturePlayer, removeTemp, settings, tempDirectory } from './helpers.js'
import { writeFileSync } from 'node:fs'
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
      const pending = service.query(); await Promise.resolve(); service.saveSettings({ ...config, winrate: 'weighted' })
      expect(service.state().query.status).toBe('loading')
      finish?.(); await pending
      expect(service.state().battle?.players[0].status).toBe('ready')
    } finally { service.dispose() }
  })
  it('automatically imports a real fixture file and stops cleanly', async () => {
    const directory = tempDirectory()
    createGameClient(directory, 'ASIA')
    writeFileSync(path.join(directory, 'replays', 'tempArenaInfo.json'), JSON.stringify(arena('AutoCaptain')))
    const service = new RadarService(new RadarDatabase(':memory:'), catalog)
    try {
      service.saveSettings({ ...settings(), autoQuery: false, gamePath: `  ${directory}  ` })
      const imported = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Monitor fixture timed out')), 3000); service.on('state', state => { if (state.battle?.players[0]?.name === 'AutoCaptain') { clearTimeout(timer); resolve() } }) })
      await service.setMonitor(true); await imported
      expect(service.state().battle?.isDemo).toBe(false)
      expect(service.state().history).toHaveLength(1)
      await service.setMonitor(false); expect(service.state().monitor.enabled).toBe(false)
    } finally { service.dispose(); removeTemp(directory) }
  })
  it('resolves AUTO again before querying and removes a disabled secondary region', async () => {
    const directory = createGameClient(tempDirectory(), 'NA')
    const regions: string[][] = []
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, () => ({ query: async players => { regions.push(players.map(player => player.region)) } }))
    try {
      service.saveSettings({ ...settings(), gamePath: directory, autoQuery: false })
      const input = arena()
      input.vehicles.push({ ...input.vehicles[0], id: 43, name: 'Enemy', relation: 2 })
      await service.importBytes(Buffer.from(JSON.stringify(input)), 'arena.json', false)
      service.saveSettings({ ...service.state().settings, region: 'AUTO', secondaryEnabled: true, secondaryRegion: 'EU' })
      await service.query({ force: true })
      expect(regions[0]).toEqual(['NA', 'EU'])
      service.saveSettings({ ...service.state().settings, secondaryEnabled: false })
      await service.query({ force: true })
      expect(regions[1]).toEqual(['NA', 'NA'])
      expect(service.state().battle?.players.every(player => player.key.startsWith('NA:'))).toBe(true)
    } finally { service.dispose(); removeTemp(directory) }
  })
  it('blocks AUTO queries when sources disagree and does not use the old battle region', async () => {
    const directory = createGameClient(tempDirectory(), 'NA')
    let requests = 0
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, () => ({ query: async () => { requests++ } }))
    try {
      service.saveSettings({ ...settings(), gamePath: directory, autoQuery: false })
      await service.importBytes(Buffer.from(JSON.stringify(arena())), 'arena.json', false)
      service.saveSettings({ ...service.state().settings, region: 'AUTO' })
      writeFileSync(path.join(directory, 'profile', 'clientrunner.log'), 'Selected realm: eu\n')
      await expect(service.query()).rejects.toThrow('不一致')
      expect(requests).toBe(0)
      expect(service.state().query.status).toBe('idle')
    } finally { service.dispose(); removeTemp(directory) }
  })
  it('cancels a query whose AUTO resolution is overtaken by a settings change', async () => {
    const directory = createGameClient(tempDirectory(), 'NA')
    const regions: string[] = []
    const service = new RadarService(new RadarDatabase(':memory:'), catalog, () => ({ query: async players => { regions.push(...players.map(player => player.region)) } }))
    try {
      service.saveSettings({ ...settings(), gamePath: directory, autoQuery: false })
      await service.importBytes(Buffer.from(JSON.stringify(arena())), 'arena.json', false)
      service.saveSettings({ ...service.state().settings, region: 'AUTO' })
      const pending = service.query()
      service.saveSettings({ ...service.state().settings, region: 'EU' })
      await pending
      expect(regions).toEqual([])
      await service.query()
      expect(regions).toEqual(['EU'])
    } finally { service.dispose(); removeTemp(directory) }
  })
  it('rejects arbitrary directories and cancels an obsolete monitor enable', async () => {
    const directory = tempDirectory()
    const service = new RadarService(new RadarDatabase(':memory:'), catalog)
    try {
      service.saveSettings({ ...settings(), gamePath: directory })
      await expect(service.setMonitor(true)).rejects.toThrow('WorldOfWarships.exe')
      expect(service.state().monitor.enabled).toBe(false)
      createGameClient(directory)
      const pending = service.setMonitor(true)
      service.saveSettings({ ...service.state().settings, gamePath: '' })
      await pending
      expect(service.state().monitor.enabled).toBe(false)
    } finally { service.dispose(); removeTemp(directory) }
  })
})
