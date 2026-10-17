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
  it('automatically monitors the saved directory on startup', async () => {
    const directory = tempDirectory()
    createGameClient(directory, 'ASIA')
    writeFileSync(path.join(directory, 'replays', 'tempArenaInfo.json'), JSON.stringify(arena('AutoCaptain')))
    const database = new RadarDatabase(':memory:')
    database.saveSettings({ ...settings(), autoQuery: false, gamePath: directory })
    const service = new RadarService(database, catalog)
    try {
      expect(service.state().monitor.enabled).toBe(true)
      await expect.poll(() => service.state().monitor.lastFile).toBe(path.join(directory, 'replays', 'tempArenaInfo.json'))
      expect(service.state().battle?.players[0].name).toBe('AutoCaptain')
      expect(service.state().battle?.isDemo).toBe(false)
      expect(service.state().history).toHaveLength(1)
      expect(service.state().monitor.error).toBeNull()
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
  it('reports an invalid directory and recovers automatically when it becomes valid', async () => {
    const directory = tempDirectory()
    const service = new RadarService(new RadarDatabase(':memory:'), catalog)
    try {
      service.saveSettings({ ...settings(), gamePath: directory, autoQuery: false })
      await expect.poll(() => service.state().monitor.error).toContain('WorldOfWarships.exe')
      expect(service.state().monitor.enabled).toBe(true)
      createGameClient(directory)
      await expect.poll(() => service.state().monitor.error, { timeout: 4000 }).toBeNull()
      expect(service.state().monitor.lastFile).toBeNull()
    } finally { service.dispose(); removeTemp(directory) }
  })
  it('switches directories automatically and ignores an obsolete scan', async () => {
    const first = createGameClient(tempDirectory())
    const second = createGameClient(tempDirectory())
    writeFileSync(path.join(first, 'replays', 'tempArenaInfo.json'), JSON.stringify(arena('OldCaptain')))
    writeFileSync(path.join(second, 'replays', 'tempArenaInfo.json'), JSON.stringify(arena('NewCaptain')))
    const service = new RadarService(new RadarDatabase(':memory:'), catalog)
    try {
      service.saveSettings({ ...settings(), gamePath: first, autoQuery: false })
      service.saveSettings({ ...service.state().settings, gamePath: `  ${second}  ` })
      await expect.poll(() => service.state().monitor.lastFile).toBe(path.join(second, 'replays', 'tempArenaInfo.json'))
      expect(service.state().history).toHaveLength(1)
      expect(service.state().battle?.players[0].name).toBe('NewCaptain')
      service.saveSettings({ ...service.state().settings, gamePath: '' })
      expect(service.state().monitor.enabled).toBe(true)
      expect(service.state().monitor.error).toContain('选择游戏目录')
    } finally { service.dispose(); removeTemp(first); removeTemp(second) }
  })
  it('reports an unreadable lineup and clears the error after a successful retry', async () => {
    const directory = createGameClient(tempDirectory())
    const filename = path.join(directory, 'replays', 'tempArenaInfo.json')
    writeFileSync(filename, '{incomplete')
    const service = new RadarService(new RadarDatabase(':memory:'), catalog)
    try {
      service.saveSettings({ ...settings(), gamePath: directory, autoQuery: false })
      await expect.poll(() => service.state().monitor.error).toBeTruthy()
      expect(service.state().battle?.isDemo).toBe(true)
      writeFileSync(filename, JSON.stringify(arena('RecoveredCaptain')))
      await expect.poll(() => service.state().monitor.lastFile, { timeout: 4000 }).toBe(filename)
      expect(service.state().battle?.players[0].name).toBe('RecoveredCaptain')
      expect(service.state().monitor.error).toBeNull()
    } finally { service.dispose(); removeTemp(directory) }
  })
})
