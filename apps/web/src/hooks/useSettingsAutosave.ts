import { useEffect, useSyncExternalStore } from 'react'
import type { Settings } from '@aperadar/shared/types'
import type { SaveSettings } from '../lib/settingsAutosave.js'
import { getSettingsQueue } from '../lib/settingsQueue.js'

export function useSettingsAutosave(settings: Settings, onSave: SaveSettings) {
  const controller = getSettingsQueue(settings, onSave)
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const signature = JSON.stringify(settings)
  useEffect(() => { controller.receive(settings) }, [controller, signature])
  useEffect(() => () => { void controller.flush() }, [controller])
  return { ...snapshot, change: controller.change, flush: controller.flush }
}
