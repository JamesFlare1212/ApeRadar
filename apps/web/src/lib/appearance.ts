import { useEffect, useState } from 'react'
import type { Settings } from '@aperadar/shared/types'
import { DEFAULT_SETTINGS, fontFamilySchema, fontSizeSchema } from '@aperadar/shared/settings'

type Appearance = Pick<Settings, 'theme' | 'lightPalette' | 'darkPalette'> & Partial<Pick<Settings, 'fontFamily' | 'fontSize'>>
const cacheKey = 'aperadar.appearance'
const palettes = ['graphite', 'cyan', 'orange', 'violet', 'forest', 'ocean']
const layers = new Map<symbol, { appearance: Appearance; preview: boolean }>()
const listeners = new Set<(dark: boolean) => void>()

function normalize(value: unknown): Appearance | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Appearance
  if (!['light', 'dark', 'system'].includes(candidate.theme)) return null
  return {
    theme: candidate.theme,
    lightPalette: palettes.includes(candidate.lightPalette) ? candidate.lightPalette : 'graphite',
    darkPalette: palettes.includes(candidate.darkPalette) ? candidate.darkPalette : 'graphite',
    fontFamily: fontFamilySchema.safeParse(candidate.fontFamily).data ?? DEFAULT_SETTINGS.fontFamily,
    fontSize: fontSizeSchema.safeParse(candidate.fontSize).data ?? DEFAULT_SETTINGS.fontSize,
  }
}

function apply(appearance: Appearance) {
  const dark = appearance.theme === 'dark' || (appearance.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.dataset.palette = dark ? appearance.darkPalette : appearance.lightPalette
  // Quote the entire name so punctuation cannot turn a font name into CSS syntax.
  const font = appearance.fontFamily ? `"${appearance.fontFamily.replace(/[\\"]/g, '\\$&')}", var(--font-body-default)` : 'var(--font-body-default)'
  root.style.setProperty('--font-body', font)
  root.style.setProperty('--font-numeric', appearance.fontFamily ? 'var(--font-body)' : 'var(--font-numeric-default)')
  root.style.setProperty('--font-size-root', `${16 * (appearance.fontSize ?? DEFAULT_SETTINGS.fontSize) / DEFAULT_SETTINGS.fontSize}px`)
  return dark
}

function syncAppearance() {
  const all = [...layers.values()]
  const active = all.findLast(layer => layer.preview) ?? all.at(-1)
  if (!active) return
  const dark = apply(active.appearance)
  for (const listener of listeners) listener(dark)
}

export function registerAppearance(appearance: Appearance, preview = false, listener?: (dark: boolean) => void) {
  const token = Symbol('appearance')
  const value = normalize(appearance)
  if (value) layers.set(token, { appearance: value, preview })
  if (listener) listeners.add(listener)
  syncAppearance()
  return () => {
    if (listener) listeners.delete(listener)
    layers.delete(token)
    syncAppearance()
  }
}

export function applyCachedAppearance() {
  let appearance: Appearance = DEFAULT_SETTINGS
  try {
    appearance = normalize(JSON.parse(localStorage.getItem(cacheKey) ?? 'null')) ?? DEFAULT_SETTINGS
  } catch { /* Settings from the local service remain the source of truth. */ }
  apply(appearance)
}

export function useAppearance(appearance: Appearance | undefined, preview = false) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const theme = appearance?.theme, lightPalette = appearance?.lightPalette, darkPalette = appearance?.darkPalette
  const fontFamily = appearance?.fontFamily, fontSize = appearance?.fontSize
  useEffect(() => {
    if (!theme) return
    const remove = registerAppearance({ theme, lightPalette: lightPalette ?? 'graphite', darkPalette: darkPalette ?? 'graphite', fontFamily, fontSize }, preview, setDark)
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', syncAppearance)
    return () => { media.removeEventListener('change', syncAppearance); remove() }
  }, [theme, lightPalette, darkPalette, fontFamily, fontSize, preview])
  return dark
}

export function cacheAppearance(settings: Appearance) {
  try { localStorage.setItem(cacheKey, JSON.stringify(normalize(settings))) } catch { /* A disabled browser cache does not prevent saving settings. */ }
}
