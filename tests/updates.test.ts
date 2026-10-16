import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateController, type UpdateEngine } from '../apps/desktop/src/updates/controller'
import { updateConfiguration } from '../apps/desktop/src/updates/config'
import { readInstallRecord, writeInstallRecord } from '../apps/desktop/src/updates/install-record'
import { removeTemp, tempDirectory } from './helpers'

type UpdateCheckResult = NonNullable<Awaited<ReturnType<UpdateEngine['checkForUpdates']>>>

function checkResult(available = true): UpdateCheckResult {
  const updateInfo = { version: '3.1.0', files: [], path: '', sha512: '', releaseDate: '2026-10-16T00:00:00.000Z' }
  return { isUpdateAvailable: available, updateInfo, versionInfo: updateInfo }
}

class FakeEngine extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowPrerelease = true
  allowDowngrade = true
  channel: string | null = null
  checkForUpdates = vi.fn(async () => checkResult())
  downloadUpdate = vi.fn(async () => ['verified-installer.exe'])
  quitAndInstall = vi.fn()
}

const controllers: UpdateController[] = []
function setup(overrides: Partial<ConstructorParameters<typeof UpdateController>[0]> = {}) {
  const engine = new FakeEngine()
  const emit = vi.fn()
  const prepareInstall = vi.fn(async () => {})
  const controller = new UpdateController({ version: '3.0.0', mode: 'installed', engine: engine as UpdateEngine, emit, canInstall: () => true, prepareInstall, ...overrides })
  controllers.push(controller)
  return { controller, engine, emit, prepareInstall }
}

afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); vi.useRealTimers() })

describe('desktop update lifecycle', () => {
  it('only offers stable updates and never downloads or installs implicitly', async () => {
    const { controller, engine } = setup()
    expect(engine).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false, channel: 'latest' })
    expect(await controller.check()).toMatchObject({ status: 'available', availableVersion: '3.1.0', currentVersion: '3.0.0' })
    expect(engine.downloadUpdate).not.toHaveBeenCalled()
    expect(await controller.download()).toMatchObject({ status: 'downloaded', downloadPercent: 100 })
    expect(engine.quitAndInstall).not.toHaveBeenCalled()
  })

  it('checks after startup and every four minutes, starts only once, and stops on disposal', async () => {
    vi.useFakeTimers()
    const { controller, engine } = setup()
    controller.start(); controller.start()
    await vi.advanceTimersByTimeAsync(14_999)
    expect(engine.checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(225_000)
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(2)
    controller.dispose()
    await vi.advanceTimersByTimeAsync(240_000)
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('serializes checks and clears an obsolete offered version when no update remains', async () => {
    const { controller, engine } = setup()
    let finish!: (result: UpdateCheckResult) => void
    engine.checkForUpdates.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = controller.check()
    expect((await controller.check()).status).toBe('checking')
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1)
    finish(checkResult())
    await pending
    engine.checkForUpdates.mockResolvedValueOnce(checkResult(false))
    expect(await controller.check()).toMatchObject({ status: 'idle', availableVersion: null })
  })

  it('reports check errors with the actual check time and allows retry', async () => {
    const { controller, engine } = setup({ now: () => 1234 })
    engine.checkForUpdates.mockRejectedValueOnce(new Error('Network unavailable'))
    expect(await controller.check()).toMatchObject({ status: 'error', errorContext: 'check', error: 'Network unavailable', checkedAt: 1234 })
    expect((await controller.check()).status).toBe('available')
  })

  it('reports finite download progress and retries failed downloads', async () => {
    const { controller, engine } = setup()
    await controller.check()
    engine.downloadUpdate.mockImplementationOnce(async () => {
      engine.emit('download-progress', { percent: 42.9 })
      expect(controller.status().downloadPercent).toBe(42)
      engine.emit('download-progress', { percent: Infinity })
      expect(controller.status().downloadPercent).toBe(42)
      engine.emit('download-progress', { percent: 120 })
      expect(controller.status().downloadPercent).toBe(100)
      throw new Error('Download interrupted')
    })
    expect(await controller.download()).toMatchObject({ status: 'error', errorContext: 'download', error: 'Download interrupted', downloadPercent: null })
    expect((await controller.download()).status).toBe('downloaded')
  })

  it('does not claim an empty download is ready', async () => {
    const { controller, engine } = setup()
    await controller.check()
    engine.downloadUpdate.mockResolvedValueOnce([])
    expect(await controller.download()).toMatchObject({ status: 'error', errorContext: 'download' })
  })

  it('retains the verified download when manual or scheduled checks run', async () => {
    const { controller, engine } = setup()
    await controller.check(); await controller.download(); await controller.check()
    expect(controller.status().status).toBe('downloaded')
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('checks portable builds but never downloads or installs an installer', async () => {
    const { controller, engine } = setup({ mode: 'portable' })
    await controller.check(); await controller.download(); controller.install()
    expect(controller.status().status).toBe('available')
    expect(engine.downloadUpdate).not.toHaveBeenCalled()
    expect(engine.quitAndInstall).not.toHaveBeenCalled()
  })

  it('keeps development/unconfigured builds disabled without checking the network', async () => {
    vi.useFakeTimers()
    const { controller, engine } = setup({ mode: 'disabled', disabledReason: '未配置发布源' })
    controller.start(); await controller.check(); await controller.download(); controller.install()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(controller.status()).toMatchObject({ status: 'disabled', disabledReason: '未配置发布源', checkedAt: null })
    expect(engine.checkForUpdates).not.toHaveBeenCalled()
  })

  it('requires the install action, records the version, and returns before quitting', async () => {
    vi.useFakeTimers()
    const { controller, engine, prepareInstall } = setup()
    await controller.check(); await controller.download()
    expect(controller.install().status).toBe('installing')
    expect(engine.quitAndInstall).not.toHaveBeenCalled()
    await vi.runOnlyPendingTimersAsync()
    expect(prepareInstall).toHaveBeenCalledWith('3.1.0')
    expect(engine.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('holds installation while a query is active and allows a later click', async () => {
    vi.useFakeTimers()
    let busy = true
    const { controller, engine } = setup({ canInstall: () => !busy })
    await controller.check(); await controller.download()
    expect(controller.install()).toMatchObject({ status: 'downloaded', errorContext: 'install' })
    busy = false
    controller.install()
    await vi.runOnlyPendingTimersAsync()
    expect(engine.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('rechecks query activity after asynchronous installation preparation', async () => {
    vi.useFakeTimers()
    let busy = false
    const { controller, engine } = setup({ canInstall: () => !busy, prepareInstall: async () => { busy = true } })
    await controller.check(); await controller.download(); controller.install()
    await vi.runOnlyPendingTimersAsync()
    expect(engine.quitAndInstall).not.toHaveBeenCalled()
    expect(controller.status()).toMatchObject({ status: 'downloaded', errorContext: 'install' })
  })

  it('recovers synchronous and asynchronous installer failures without discarding the download', async () => {
    vi.useFakeTimers()
    const { controller, engine } = setup()
    await controller.check(); await controller.download()
    engine.quitAndInstall.mockImplementationOnce(() => { throw new Error('Installer unavailable') })
    controller.install(); await vi.runOnlyPendingTimersAsync()
    expect(controller.status()).toMatchObject({ status: 'downloaded', errorContext: 'install', error: 'Installer unavailable' })
    controller.install(); await vi.runOnlyPendingTimersAsync()
    engine.emit('error', new Error('Permission denied'))
    expect(controller.status()).toMatchObject({ status: 'downloaded', errorContext: 'install', error: 'Permission denied' })
  })

  it('does not publish late results or launch a queued installer after disposal', async () => {
    vi.useFakeTimers()
    const { controller, engine, emit } = setup()
    await controller.check(); await controller.download(); controller.install()
    controller.dispose()
    const count = emit.mock.calls.length
    await vi.runOnlyPendingTimersAsync()
    engine.emit('error', new Error('Late teardown error'))
    expect(engine.quitAndInstall).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledTimes(count)
  })
})

describe('update configuration and installation record', () => {
  it('only enables packaged Windows builds with explicit update metadata', () => {
    const environment = { packaged: true, development: false, disabled: false, platform: 'win32' as const, configured: true, portable: false }
    expect(updateConfiguration(environment).mode).toBe('installed')
    expect(updateConfiguration({ ...environment, portable: true }).mode).toBe('portable')
    expect(updateConfiguration({ ...environment, configured: false })).toMatchObject({ mode: 'disabled', disabledReason: expect.stringContaining('发布源') })
    expect(updateConfiguration({ ...environment, development: true }).mode).toBe('disabled')
    expect(updateConfiguration({ ...environment, packaged: false }).mode).toBe('disabled')
    expect(updateConfiguration({ ...environment, disabled: true }).mode).toBe('disabled')
    expect(updateConfiguration({ ...environment, platform: 'darwin' }).mode).toBe('disabled')
  })

  it('detects an unapplied installation and clears the record once the version changes', async () => {
    const directory = tempDirectory()
    const file = path.join(directory, 'update-install.json')
    try {
      expect(await readInstallRecord(file, '3.0.0')).toBeNull()
      await writeInstallRecord(file, '3.0.0', '3.1.0')
      expect(await readInstallRecord(file, '3.0.0')).toBe('3.1.0')
      expect(await readInstallRecord(file, '3.1.0')).toBeNull()
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally { removeTemp(directory) }
  })
})
