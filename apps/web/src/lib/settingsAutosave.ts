import type { Settings } from '@aperadar/shared/types'
import { settingsSchema } from '@aperadar/shared/settings'

type Key = keyof Settings
type Edit = { value: Settings[Key]; revision: number }
export type SaveSettings = (settings: Settings) => Promise<boolean>
export interface SettingsDraft {
  draft: Settings
  status: 'saved' | 'pending' | 'saving' | 'error'
  error: string
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

// The queue survives the settings page so leaving and reopening cannot create competing writers.
export class SettingsAutosave {
  private base: Settings
  private observed: Settings
  private edits = new Map<Key, Edit>()
  private revision = 0
  private running: Promise<boolean> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()
  private acknowledgments: string[] = []
  private external: Set<Key> | null = null
  private snapshot: SettingsDraft
  constructor(settings: Settings, private save: SaveSettings, private onSaved: (settings: Settings) => void = () => {}) {
    this.base = settingsSchema.parse(settings)
    this.observed = structuredClone(this.base)
    this.snapshot = { draft: structuredClone(this.base), status: 'saved', error: '' }
  }
  setSave(save: SaveSettings) { this.save = save }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private draft() {
    const draft = structuredClone(this.base)
    for (const [key, edit] of this.edits) Object.assign(draft, { [key]: structuredClone(edit.value) })
    return draft
  }
  private publish(status = this.snapshot.status, error = this.snapshot.error) {
    this.snapshot = { draft: this.draft(), status, error }
    for (const listener of this.listeners) listener()
  }
  receive(settings: Settings) {
    const next = settingsSchema.parse(settings)
    const acknowledgment = this.acknowledgments.indexOf(JSON.stringify(next))
    if (acknowledgment >= 0) this.acknowledgments.splice(acknowledgment, 1)
    if (same(next, this.observed)) return
    if (acknowledgment >= 0) {
      this.observed = structuredClone(next)
      return
    }
    else {
      for (const key of Object.keys(next) as Key[]) {
        if (same(next[key], this.observed[key])) continue
        // Other controls submit full snapshots too. Their stale copies of a
        // locally edited field must not cancel that edit while changing theme.
        if (this.edits.has(key)) continue
        Object.assign(this.base, { [key]: structuredClone(next[key]) })
        this.external?.add(key)
      }
      this.onSaved(this.draft())
    }
    this.observed = structuredClone(next)
    this.publish()
  }
  change = (patch: Partial<Settings>, delay = 350) => {
    for (const key of Object.keys(patch) as Key[]) this.edits.set(key, { value: structuredClone(patch[key]) as Settings[Key], revision: ++this.revision })
    this.publish('pending', '')
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; void this.flush() }, delay)
  }
  flush = (): Promise<boolean> => {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.running) return this.running
    this.running = this.work().finally(() => { this.running = null })
    return this.running
  }
  private async work(): Promise<boolean> {
    while (this.edits.size) {
      const sentEdits = new Map(this.edits)
      const parsed = settingsSchema.safeParse(this.draft())
      if (!parsed.success) { this.publish('error', parsed.error.issues[0]?.message ?? '请检查设置'); return false }
      const sent = parsed.data
      const external = new Set<Key>()
      this.external = external
      this.acknowledgments.push(JSON.stringify(sent))
      this.acknowledgments = this.acknowledgments.slice(-16)
      this.publish('saving', '')
      let success = false
      try { success = await this.save(sent) } catch { /* Preserve edits for an explicit retry. */ }
      this.external = null
      if (!success) { this.publish('error', '保存失败，更改已保留，请重试。'); return false }
      for (const key of Object.keys(sent) as Key[]) {
        if (!external.has(key)) Object.assign(this.base, { [key]: structuredClone(sent[key]) })
      }
      for (const [key, edit] of sentEdits) {
        if (this.edits.get(key)?.revision === edit.revision) this.edits.delete(key)
      }
      // A full-settings write may have carried an older theme. Rebase any external
      // changes received while it was in flight before sending the next write.
      for (const key of external) {
        if (!this.edits.has(key) && !same(this.base[key], sent[key])) this.edits.set(key, { value: structuredClone(this.base[key]), revision: ++this.revision })
      }
      this.onSaved(this.draft())
      this.publish(this.edits.size ? 'pending' : 'saved', '')
    }
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.publish('saved', '')
    return true
  }
}
