import { useEffect, useSyncExternalStore } from 'react'
import type { Settings } from '@aperadar/shared/types'
import { cacheAppearance } from './appearance.js'
import { SettingsAutosave, type SaveSettings } from './settingsAutosave.js'

let queue: SettingsAutosave | null = null

export function useSettingsAutosave(settings: Settings, onSave: SaveSettings) {
  const controller = queue ??= new SettingsAutosave(settings, onSave, cacheAppearance)
  controller.setSave(onSave)
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const signature = JSON.stringify(settings)
  useEffect(() => { controller.receive(settings) }, [controller, signature])
  useEffect(() => () => { void controller.flush() }, [controller])
  return { ...snapshot, change: controller.change, flush: controller.flush }
}
