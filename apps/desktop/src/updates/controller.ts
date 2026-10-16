import type { AppUpdater } from 'electron-updater'
import { initialUpdateState, type UpdateState } from '@aperadar/shared/updates'

export type UpdateEngine = Pick<AppUpdater,
  'autoDownload' | 'autoInstallOnAppQuit' | 'allowPrerelease' | 'allowDowngrade' | 'channel' |
  'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'
> & {
  on(event: 'download-progress' | 'error', listener: (value: unknown) => void): unknown
  removeListener(event: 'download-progress' | 'error', listener: (value: unknown) => void): unknown
}

interface UpdateOptions {
  version: string
  mode: UpdateState['mode']
  disabledReason?: string | null
  engine: UpdateEngine | null
  emit(state: UpdateState): void
  canInstall(): boolean
  prepareInstall(targetVersion: string): Promise<void>
  notAppliedVersion?: string | null
  now?: () => number
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export class UpdateController {
  private state: UpdateState
  private action: 'check' | 'download' | 'install' | null = null
  private timers: Array<ReturnType<typeof setTimeout>> = []
  private listeners: Array<['download-progress' | 'error', (value: unknown) => void]> = []
  private started = false
  private disposed = false

  constructor(private options: UpdateOptions) {
    this.state = initialUpdateState(options.version, options.mode, options.disabledReason ?? null)
    this.state.notAppliedVersion = options.notAppliedVersion ?? null
    const engine = options.engine
    if (!engine || options.mode === 'disabled') return
    engine.autoDownload = false
    engine.autoInstallOnAppQuit = false
    engine.channel = 'latest'
    engine.allowPrerelease = false
    // Changing the channel enables downgrades in electron-updater; restore the stable policy.
    engine.allowDowngrade = false
    this.listen('download-progress', value => {
      if (this.action !== 'download' || this.state.status !== 'downloading') return
      const percent = (value as { percent?: unknown } | null)?.percent
      if (typeof percent === 'number' && Number.isFinite(percent)) this.set({ downloadPercent: Math.max(0, Math.min(100, Math.floor(percent))) })
    })
    this.listen('error', error => {
      if (this.action === 'install') this.installFailure(error)
      // Check/download promises own their errors. An error listener also prevents
      // EventEmitter from throwing for late errors during shutdown.
    })
  }

  status = (): UpdateState => ({ ...this.state })

  private set(patch: Partial<UpdateState>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.options.emit(this.status())
  }

  private listen(event: 'download-progress' | 'error', listener: (value: unknown) => void): void {
    this.options.engine?.on(event, listener)
    this.listeners.push([event, listener])
  }

  start(): void {
    if (this.started || this.disposed || this.state.mode === 'disabled') return
    this.started = true
    this.timers.push(setTimeout(() => void this.check(), 15_000))
    this.timers.push(setInterval(() => void this.check(), 4 * 60_000))
  }

  async check(): Promise<UpdateState> {
    const engine = this.options.engine
    // A check must not replace the version of an already verified download.
    if (!engine || this.disposed || this.state.mode === 'disabled' || this.action || this.state.status === 'downloaded') return this.status()
    this.action = 'check'
    const previous = this.status()
    this.set({ status: 'checking', error: null, errorContext: null })
    try {
      const result = await engine.checkForUpdates()
      if (!result) throw new Error('更新服务器未返回检查结果')
      this.set({
        status: result.isUpdateAvailable ? 'available' : 'idle',
        availableVersion: result.isUpdateAvailable ? result.updateInfo.version : null,
        downloadPercent: null,
        checkedAt: (this.options.now ?? Date.now)(),
      })
    } catch (error) {
      this.set({ ...previous, status: 'error', error: errorMessage(error), errorContext: 'check', checkedAt: (this.options.now ?? Date.now)() })
    } finally { this.action = null }
    return this.status()
  }

  async download(): Promise<UpdateState> {
    const engine = this.options.engine
    if (!engine || this.disposed || this.state.mode !== 'installed' || this.action || !this.state.availableVersion ||
      !(this.state.status === 'available' || (this.state.status === 'error' && this.state.errorContext === 'download'))) return this.status()
    this.action = 'download'
    this.set({ status: 'downloading', downloadPercent: 0, error: null, errorContext: null })
    try {
      const files = await engine.downloadUpdate()
      if (!files.length) throw new Error('更新下载未生成安装程序')
      this.set({ status: 'downloaded', downloadPercent: 100 })
    } catch (error) {
      this.set({ status: 'error', error: errorMessage(error), errorContext: 'download', downloadPercent: null })
    } finally { this.action = null }
    return this.status()
  }

  install = (): UpdateState => {
    if (this.disposed || !this.options.engine || this.state.mode !== 'installed' || this.action || this.state.status !== 'downloaded') return this.status()
    if (!this.options.canInstall()) {
      this.set({ error: '请等待当前查询完成后再安装更新', errorContext: 'install' })
      return this.status()
    }
    this.action = 'install'
    this.set({ status: 'installing', error: null, errorContext: null })
    // Let IPC return before the updater closes the application.
    this.timers.push(setTimeout(() => void this.applyInstall(), 0))
    return this.status()
  }

  private async applyInstall(): Promise<void> {
    try {
      if (this.disposed) return
      if (!this.options.canInstall()) throw new Error('查询已开始，请完成后重新安装更新')
      await this.options.prepareInstall(this.state.availableVersion!)
      if (this.disposed || this.action !== 'install') return
      if (!this.options.canInstall()) throw new Error('查询已开始，请完成后重新安装更新')
      this.options.engine!.quitAndInstall(false, true)
    } catch (error) { this.installFailure(error) }
  }

  private installFailure(error: unknown): void {
    this.action = null
    // The host keeps its service open until before-quit, so the user can retry.
    this.set({ status: 'downloaded', error: errorMessage(error), errorContext: 'install' })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const timer of this.timers) clearTimeout(timer)
    for (const [event, listener] of this.listeners) this.options.engine?.removeListener(event, listener)
    // Download teardown can emit one more asynchronous error before process exit.
    this.options.engine?.on('error', () => {})
    this.timers = []
    this.listeners = []
  }
}
