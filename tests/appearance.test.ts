import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCachedAppearance, registerAppearance } from '../apps/web/src/lib/appearance.ts'
import { DEFAULT_SETTINGS } from '@aperadar/shared/settings'

afterEach(() => vi.unstubAllGlobals())

function documentFixture() {
  const classes = new Set<string>()
  const properties = new Map<string, string>()
  const root = { classList: { contains: (key: string) => classes.has(key), toggle: (key: string, enabled: boolean) => { if (enabled) classes.add(key); else classes.delete(key) } }, dataset: {} as Record<string, string>, style: { setProperty: (key: string, value: string) => properties.set(key, value), getPropertyValue: (key: string) => properties.get(key) } }
  vi.stubGlobal('document', { documentElement: root })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  return root
}

describe('appearance previews', () => {
  it('keeps the settings preview above external theme updates and restores saved appearance on leaving', () => {
    const root = documentFixture()
    const current = vi.fn()
    const removeBase = registerAppearance({ theme: 'light', lightPalette: 'graphite', darkPalette: 'graphite' }, false, current)
    const removePreview = registerAppearance({ theme: 'dark', lightPalette: 'cyan', darkPalette: 'violet', fontFamily: 'MiSans', fontSize: 20 }, true)
    const removeExternal = registerAppearance({ theme: 'light', lightPalette: 'forest', darkPalette: 'ocean' })
    try {
      expect(root.classList.contains('dark')).toBe(true)
      expect(root.dataset.palette).toBe('violet')
      expect(current).toHaveBeenLastCalledWith(true)
      expect(root.style.getPropertyValue('--font-body')).toContain('"MiSans"')
      expect(Number.parseFloat(root.style.getPropertyValue('--font-size-root')!)).toBeCloseTo(16 * 20 / 14)
      removePreview()
      expect(root.classList.contains('dark')).toBe(false)
      expect(root.dataset.palette).toBe('forest')
      expect(current).toHaveBeenLastCalledWith(false)
      expect(root.style.getPropertyValue('--font-body')).toBe('var(--font-body-default)')
      expect(root.style.getPropertyValue('--font-size-root')).toBe('16px')
    } finally { removeExternal(); removePreview(); removeBase() }
  })
  it('restores the previous cached theme even when a pre-palette cache lacks the new fields', () => {
    const root = documentFixture()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ theme: 'dark' }) })
    applyCachedAppearance()
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.dataset.palette).toBe('graphite')
    expect(root.style.getPropertyValue('--font-size-root')).toBe('16px')
  })
  it('restores cached typography before the local service loads', () => {
    const root = documentFixture()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...DEFAULT_SETTINGS, fontFamily: 'Microsoft YaHei', fontSize: 18 }) })
    applyCachedAppearance()
    expect(root.style.getPropertyValue('--font-body')).toBe('"Microsoft YaHei", var(--font-body-default)')
    expect(root.style.getPropertyValue('--font-numeric')).toBe('var(--font-body)')
    expect(Number.parseFloat(root.style.getPropertyValue('--font-size-root')!)).toBeCloseTo(16 * 18 / 14)
  })
  it('ignores invalid cached typography without losing the cached theme', () => {
    const root = documentFixture()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ theme: 'dark', fontFamily: 'bad\nfont', fontSize: 200 }) })
    applyCachedAppearance()
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.getPropertyValue('--font-body')).toBe('var(--font-body-default)')
    expect(root.style.getPropertyValue('--font-size-root')).toBe('16px')
  })
  it('treats punctuation and CSS-like text as a single literal font name', () => {
    const root = documentFixture()
    const remove = registerAppearance({ ...DEFAULT_SETTINGS, fontFamily: 'A"\\, serif; color: red', fontSize: 14 })
    try { expect(root.style.getPropertyValue('--font-body')).toBe('"A\\"\\\\, serif; color: red", var(--font-body-default)') }
    finally { remove() }
  })
})
