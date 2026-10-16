import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '@aperadar/shared/types'
import { SettingsAutosave } from '../apps/web/src/lib/settingsAutosave.ts'
import { settings } from './helpers.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('settings autosave queue', () => {
  it('coalesces rapid edits and preserves untouched settings', async () => {
    const original = { ...settings(), gamePath: 'D:\\Games\\WoWS', apeThreshold: 44, unicumThreshold: 62 }
    const save = vi.fn(async (_next: Settings) => true)
    const queue = new SettingsAutosave(original, save)
    queue.change({ theme: 'dark' })
    queue.change({ lightPalette: 'cyan' })
    queue.change({ darkPalette: 'violet' })
    await queue.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0]).toEqual({ ...original, theme: 'dark', lightPalette: 'cyan', darkPalette: 'violet' })
    expect(queue.getSnapshot().status).toBe('saved')
  })

  it('saves the final theme and palettes when edits continue during a slow save', async () => {
    const first = deferred<boolean>()
    const writes: Settings[] = []
    const queue = new SettingsAutosave(settings(), async next => { writes.push(next); return writes.length === 1 ? first.promise : true })
    queue.change({ theme: 'dark' }, 0)
    const saving = queue.flush()
    queue.change({ lightPalette: 'cyan', darkPalette: 'violet' }, 0)
    queue.change({ theme: 'light' }, 0)
    expect(queue.flush()).toBe(saving)
    first.resolve(true)
    await saving
    expect(writes).toHaveLength(2)
    expect(writes[1]).toMatchObject({ theme: 'light', lightPalette: 'cyan', darkPalette: 'violet' })
    expect(queue.getSnapshot()).toMatchObject({ draft: writes[1], status: 'saved', error: '' })
  })

  it('rebases an external theme change received during an older full-settings write', async () => {
    const first = deferred<boolean>()
    const writes: Settings[] = []
    const original = settings()
    const queue = new SettingsAutosave(original, async next => { writes.push(next); return writes.length === 1 ? first.promise : true })
    queue.change({ cacheMinutes: 45 })
    const saving = queue.flush()
    queue.receive({ ...original, theme: 'dark' })
    // The older request's state event must not overwrite the external theme.
    queue.receive(writes[0])
    first.resolve(true)
    await saving
    expect(writes).toHaveLength(2)
    expect(writes[1]).toMatchObject({ theme: 'dark', cacheMinutes: 45 })
    expect(queue.getSnapshot().draft).toMatchObject({ theme: 'dark', cacheMinutes: 45 })
  })

  it('continues one queue when leaving, reopening, and editing before the old save completes', async () => {
    const first = deferred<boolean>()
    const writes: Settings[] = []
    let active = 0, highest = 0
    const save = async (next: Settings) => {
      active++; highest = Math.max(highest, active); writes.push(next)
      const result = writes.length === 1 ? await first.promise : true
      active--
      return result
    }
    const queue = new SettingsAutosave(settings(), save)
    const stop = queue.subscribe(() => {})
    queue.change({ lightPalette: 'cyan' })
    const leaving = queue.flush()
    stop()
    queue.setSave(save)
    queue.receive(settings())
    queue.change({ theme: 'light', darkPalette: 'violet' })
    first.resolve(true)
    await leaving
    expect(highest).toBe(1)
    expect(writes).toHaveLength(2)
    expect(writes[1]).toMatchObject({ theme: 'light', lightPalette: 'cyan', darkPalette: 'violet' })
  })

  it('preserves a local edit when its acknowledgment arrives before an external theme snapshot with stale fields', async () => {
    const first = deferred<boolean>()
    const writes: Settings[] = []
    const original = settings()
    const queue = new SettingsAutosave(original, async next => { writes.push(next); return writes.length === 1 ? first.promise : true })
    queue.change({ cacheMinutes: 45 })
    const saving = queue.flush()
    queue.receive(writes[0])
    queue.receive({ ...original, theme: 'dark' })
    first.resolve(true)
    await saving
    expect(writes.at(-1)).toMatchObject({ theme: 'dark', cacheMinutes: 45 })
    expect(queue.getSnapshot().draft).toMatchObject({ theme: 'dark', cacheMinutes: 45 })
  })

  it('retains failed edits for retry and blocks invalid thresholds without resetting the draft', async () => {
    let succeeds = false
    const save = vi.fn(async (_next: Settings) => succeeds)
    const queue = new SettingsAutosave(settings(), save)
    queue.change({ gamePath: 'E:\\WorldOfWarships', apeThreshold: 70 })
    expect(await queue.flush()).toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(queue.getSnapshot().draft.gamePath).toBe('E:\\WorldOfWarships')
    queue.change({ apeThreshold: 44 })
    expect(await queue.flush()).toBe(false)
    expect(queue.getSnapshot().status).toBe('error')
    succeeds = true
    expect(await queue.flush()).toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(queue.getSnapshot()).toMatchObject({ status: 'saved', draft: { gamePath: 'E:\\WorldOfWarships', apeThreshold: 44 } })
  })
})
