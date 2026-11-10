import type { Settings } from '@aperadar/shared/types'
import { cacheAppearance } from './appearance.js'
import { SettingsAutosave, type SaveSettings } from './settingsAutosave.js'

let queue: SettingsAutosave | null = null

export function getSettingsQueue(settings: Settings, save: SaveSettings): SettingsAutosave {
  const controller = queue ??= new SettingsAutosave(settings, save, cacheAppearance)
  controller.setSave(save)
  return controller
}

export function receiveSettingsSnapshot(settings: Settings): void { queue?.receive(settings) }

export function saveSettingsPatch(settings: Settings, save: SaveSettings, patch: Partial<Settings>): Promise<boolean> {
  const controller = getSettingsQueue(settings, save)
  // Existing queue state can be newer than the props captured by this event handler.
  controller.change(patch, 0)
  return controller.flush()
}
