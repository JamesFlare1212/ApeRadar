import { DatabaseSync } from 'node:sqlite'
import { utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RadarService } from '@aperadar/server/service'
import { RadarDatabase } from '@aperadar/server/database'
import { arena, catalog, createGameClient, deferred, fixturePlayer, removeTemp, settings, tempDirectory } from './helpers.js'

describe('service persistence boundaries', () => {
  it.each(['settings', 'import', 'history'] as const)('keeps memory and the current snapshot unchanged when a %s write fails', async operation => {
    const directory = tempDirectory(), filename = path.join(directory, 'failures.sqlite')
    const database = new RadarDatabase(filename), service = new RadarService(database, catalog)
    const fault = new DatabaseSync(filename)
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      await service.importBytes(Buffer.from(JSON.stringify(arena('OldCaptain'))), 'old.json', false)
      const before = service.state()
      database.saveBattle({ ...before.battle!, id: 'history-target', map: 'Another map' })
      database.saveBattle(before.battle!)
      const timing = operation === 'import' ? 'INSERT' : 'UPDATE'
      fault.exec(`CREATE TRIGGER reject_write BEFORE ${timing} ON battles BEGIN SELECT RAISE(ABORT, 'Simulated storage failure'); END`)
      if (operation === 'settings') expect(() => service.saveSettings({ ...before.settings, region: 'EU' })).toThrow('Simulated storage failure')
      else if (operation === 'history') expect(() => service.loadBattle('history-target')).toThrow('Simulated storage failure')
      else await expect(service.importBytes(Buffer.from(JSON.stringify(arena('NewCaptain'))), 'new.json', false)).rejects.toThrow('Simulated storage failure')
      expect(service.state().settings).toEqual(before.settings)
      expect(service.state().battle).toEqual(before.battle)
      expect(database.getSettings()).toEqual(before.settings)
      expect(database.lastBattle()).toEqual(before.battle)
      fault.exec('DROP TRIGGER reject_write')
      if (operation === 'settings') expect(service.saveSettings({ ...before.settings, region: 'EU' }).settings.region).toBe('EU')
      else if (operation === 'history') expect(service.loadBattle('history-target').battle?.id).toBe('history-target')
      else expect((await service.importBytes(Buffer.from(JSON.stringify(arena('NewCaptain'))), 'new.json', false)).battle?.players[0].name).toBe('NewCaptain')
    } finally { fault.close(); service.dispose(); removeTemp(directory) }
  })

  it.each(['settings', 'import', 'demo', 'history'] as const)('does not abort an active query when a %s write is rejected', async operation => {
    const started = deferred<void>(), finish = deferred<void>()
    let signal!: AbortSignal
    const database = new RadarDatabase(':memory:')
    const service = new RadarService(database, catalog, () => ({ query: async (_players, active) => { signal = active; started.resolve(); await finish.promise } }))
    let query: Promise<unknown> | undefined
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      await service.importBytes(Buffer.from(JSON.stringify(arena())), 'arena.json', false)
      const before = service.state()
      query = service.query(); await started.promise
      if (operation === 'settings') vi.spyOn(database, 'saveSettings').mockImplementationOnce(() => { throw new Error('Storage is read-only') })
      else vi.spyOn(database, 'saveBattle').mockImplementationOnce(() => { throw new Error('Storage is read-only') })
      if (operation === 'settings') expect(() => service.saveSettings({ ...before.settings, region: 'EU' })).toThrow('read-only')
      else if (operation === 'demo') expect(() => service.loadDemo()).toThrow('read-only')
      else if (operation === 'history') expect(() => service.loadBattle(before.battle!.id)).toThrow('read-only')
      else await expect(service.importBytes(Buffer.from(JSON.stringify(arena('NewCaptain'))), 'new.json', false)).rejects.toThrow('read-only')
      expect(signal.aborted).toBe(false)
      expect(service.state().settings).toEqual(before.settings)
      expect(service.state().battle).toEqual(before.battle)
    } finally { finish.resolve(); await query; service.dispose() }
  })

  it('publishes a cancelled query even if saving its progress fails', async () => {
    const started = deferred<void>(), finish = deferred<void>(), snapshots: string[] = []
    const database = new RadarDatabase(':memory:')
    const service = new RadarService(database, catalog, () => ({ query: async (players, _signal, onPlayer) => {
      onPlayer({ ...players[0], status: 'ready', stats: fixturePlayer().stats }); started.resolve(); await finish.promise
    } }))
    let query: Promise<unknown> | undefined
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      await service.importBytes(Buffer.from(JSON.stringify(arena())), 'arena.json', false)
      service.on('state', state => snapshots.push(state.query.status))
      query = service.query(); await started.promise
      vi.spyOn(database, 'saveBattle').mockImplementationOnce(() => { throw new Error('Snapshot is read-only') })
      expect(() => service.cancelQuery()).toThrow('read-only')
      expect(snapshots.at(-1)).toBe('idle')
      expect(service.state().query.message).toContain('保存')
    } finally { finish.resolve(); await query; service.dispose() }
  })

  it('still aborts and closes storage when saving shutdown progress fails', async () => {
    const started = deferred<void>(), finish = deferred<void>()
    let signal!: AbortSignal
    const database = new RadarDatabase(':memory:')
    const service = new RadarService(database, catalog, () => ({ query: async (_players, active) => { signal = active; started.resolve(); await finish.promise } }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    let query: Promise<unknown> | undefined
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      await service.importBytes(Buffer.from(JSON.stringify(arena())), 'arena.json', false)
      query = service.query(); await started.promise
      vi.spyOn(database, 'saveBattle').mockImplementationOnce(() => { throw new Error('Disk full') })
      const close = vi.spyOn(database, 'close')
      expect(() => service.dispose()).not.toThrow()
      expect(signal.aborted).toBe(true)
      expect(close).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalled()
    } finally { finish.resolve(); await query?.catch(() => {}); service.dispose(); log.mockRestore() }
  })
})

describe('arena content identity', () => {
  it('imports changed contents even when the filename, size and mtime are unchanged', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const directory = createGameClient(tempDirectory())
    const filename = path.join(directory, 'replays', 'tempArenaInfo.json'), stamp = new Date('2026-10-16T12:00:00Z')
    writeFileSync(filename, JSON.stringify(arena('OldCaptain'))); utimesSync(filename, stamp, stamp)
    const database = new RadarDatabase(':memory:')
    database.saveSettings({ ...settings(), gamePath: directory, autoQuery: false })
    const service = new RadarService(database, catalog)
    try {
      await expect.poll(() => service.state().battle?.players[0].name).toBe('OldCaptain')
      writeFileSync(filename, JSON.stringify(arena('NewCaptain'))); utimesSync(filename, stamp, stamp)
      await vi.advanceTimersByTimeAsync(2000)
      await expect.poll(() => service.state().battle?.players[0].name, { timeout: 1000 }).toBe('NewCaptain')
      expect(service.state().history).toHaveLength(2)
    } finally { service.dispose(); removeTemp(directory); vi.useRealTimers() }
  })
})
