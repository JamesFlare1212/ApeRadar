import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCachedAppearance, registerAppearance } from '../apps/web/src/lib/appearance.ts'

afterEach(() => vi.unstubAllGlobals())

function documentFixture() {
  const classes = new Set<string>()
  const root = { classList: { contains: (key: string) => classes.has(key), toggle: (key: string, enabled: boolean) => { if (enabled) classes.add(key); else classes.delete(key) } }, dataset: {} as Record<string, string> }
  vi.stubGlobal('document', { documentElement: root })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  return root
}

describe('appearance previews', () => {
  it('keeps the settings preview above external theme updates and restores saved appearance on leaving', () => {
    const root = documentFixture()
    const current = vi.fn()
    const removeBase = registerAppearance({ theme: 'light', lightPalette: 'graphite', darkPalette: 'graphite' }, false, current)
    const removePreview = registerAppearance({ theme: 'dark', lightPalette: 'cyan', darkPalette: 'violet' }, true)
    const removeExternal = registerAppearance({ theme: 'light', lightPalette: 'forest', darkPalette: 'ocean' })
    try {
      expect(root.classList.contains('dark')).toBe(true)
      expect(root.dataset.palette).toBe('violet')
      expect(current).toHaveBeenLastCalledWith(true)
      removePreview()
      expect(root.classList.contains('dark')).toBe(false)
      expect(root.dataset.palette).toBe('forest')
      expect(current).toHaveBeenLastCalledWith(false)
    } finally { removeExternal(); removePreview(); removeBase() }
  })
  it('restores the previous cached theme even when a pre-palette cache lacks the new fields', () => {
    const root = documentFixture()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ theme: 'dark' }) })
    applyCachedAppearance()
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.dataset.palette).toBe('graphite')
  })
})
