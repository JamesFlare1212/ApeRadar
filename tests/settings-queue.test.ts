import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '@aperadar/shared/types'
import { deferred, settings } from './helpers.js'

beforeEach(() => vi.stubGlobal('localStorage', { setItem: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

describe('shared settings writers', () => {
  it.each(['pending', 'completed', 'acknowledged'] as const)('merges a workspace preference with a %s settings-page write even when its rendered snapshot is stale', async phase => {
    vi.resetModules()
    const { getSettingsQueue, saveSettingsPatch } = await import('../apps/web/src/lib/settingsQueue.ts')
    const first = deferred<boolean>(), writes: Settings[] = []
    let active = 0, highest = 0
    const save = async (next: Settings) => {
      active++; highest = Math.max(highest, active); writes.push(next)
      try { return writes.length === 1 ? await first.promise : true }
      finally { active-- }
    }
    const original = settings(), controller = getSettingsQueue(original, save)
    controller.change({ cacheMinutes: 45 })
    const settingsWrite = controller.flush()
    try {
      if (phase !== 'pending') { first.resolve(true); await settingsWrite }
      if (phase === 'acknowledged') controller.receive(writes[0])
      const workspaceWrite = saveSettingsPatch(original, save, { winrate: 'weighted' })
      first.resolve(true)
      expect(await workspaceWrite).toBe(true)
      await settingsWrite
      expect(highest).toBe(1)
      expect(writes.at(-1)).toMatchObject({ cacheMinutes: 45, winrate: 'weighted' })
      expect(controller.getSnapshot()).toMatchObject({ status: 'saved', draft: { cacheMinutes: 45, winrate: 'weighted' } })
    } finally { first.resolve(true); await controller.flush() }
  })
})
