import { ipcMain, type BrowserWindow } from 'electron'
import type { AppState, WatchInput } from '@aperadar/shared/types'
import type { RadarService } from '@aperadar/server/service'

export async function validateSnapshotOrdering(window: BrowserWindow, service: RadarService, register: (channel: string, callback: (input: unknown) => unknown) => void) {
  const original = service.state(), hash = await window.webContents.executeJavaScript('location.hash') as string
  let finish: (() => void) | null = null
  let requested!: () => void
  const request = new Promise<void>(resolve => { requested = resolve })
  ipcMain.removeHandler('radar:demo')
  register('radar:demo', () => new Promise<AppState>(resolve => { finish = () => resolve(original); requested() }))
  try {
    await window.webContents.executeJavaScript(`(async () => {
      location.hash = '/history';
      for (let attempt = 0; attempt < 80 && !document.querySelector('[aria-label=搜索历史对局]'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
      if (!document.querySelector('[aria-label=搜索历史对局]')) throw new Error('The snapshot scenario did not open history');
      document.querySelector('.app-footer button').click();
    })()`)
    await request
    const newer = structuredClone(original)
    if (!newer.battle) throw new Error('The snapshot scenario requires a synthetic battle')
    newer.settings.showNames = true
    newer.battle.id = 'smoke-newer-push'
    newer.battle.players[0].name = 'Fresh_Pushed_Captain'
    window.webContents.send('radar:changed', newer)
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    if (!finish) throw new Error('The snapshot action did not reach IPC')
    const release: () => void = finish
    release()
    await window.webContents.executeJavaScript(`(async () => {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (location.hash === '#/overview' && document.querySelector('.player-name-button')) {
          if (![...document.querySelectorAll('.player-name-button')].some(button => button.textContent.includes('Fresh_Pushed_Captain'))) throw new Error('A stale invoke response replaced a newer pushed battle');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('The deferred snapshot action did not finish navigation');
    })()`)
    return { simulated: true, newerPushRetainedAfterInvoke: true }
  } finally {
    if (finish) { const release: () => void = finish; release() }
    ipcMain.removeHandler('radar:demo')
    register('radar:demo', () => service.loadDemo())
    window.webContents.send('radar:changed', service.state())
    await window.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`)
  }
}

export async function validatePendingWatchSave(window: BrowserWindow, service: RadarService, register: (channel: string, callback: (input: unknown) => unknown) => void) {
  const original = service.state().watchlist[0]
  if (!original) throw new Error('The pending-save scenario requires a synthetic watch entry')
  const hash = await window.webContents.executeJavaScript('location.hash') as string
  let finish: ((fail?: boolean) => void) | null = null
  ipcMain.removeHandler('radar:watch')
  register('radar:watch', input => new Promise<AppState>((resolve, reject) => {
    finish = fail => {
      finish = null
      if (fail) reject(new Error('Simulated watch save failure'))
      else resolve(service.setWatch(input as WatchInput))
    }
  }))
  const wait = `const waitFor = async (condition, message) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(message);
  };`
  try {
    await window.webContents.executeJavaScript(`(async () => {
      ${wait}
      location.hash = '/watchlist';
      await waitFor(() => document.querySelector('button[aria-label^="编辑 "]'), 'The watch editor trigger did not appear');
      document.querySelector('button[aria-label^="编辑 "]').click();
      await waitFor(() => document.getElementById('edit-watch-note'), 'The watch note editor did not open');
      const input = document.getElementById('edit-watch-note');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Pending watch note regression');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(resolve));
      [...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent.includes('保存备注')).click();
      await waitFor(() => document.querySelector('[role=dialog] button[aria-busy=true]'), 'The watch save did not enter its pending state');
      if (!input.disabled) throw new Error('The watch note remains editable while its submitted value is being saved');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (!document.getElementById('edit-watch-note')) throw new Error('The pending watch editor closed');
    })()`)
    if (!finish) throw new Error('The watch save did not reach IPC')
    const fail: (fail?: boolean) => void = finish
    fail(true)
    await window.webContents.executeJavaScript(`(async () => {
      ${wait}
      await waitFor(() => document.getElementById('edit-watch-note')?.disabled === false, 'The failed watch editor did not unlock');
      if (document.getElementById('edit-watch-note').value !== 'Pending watch note regression') throw new Error('A failed save discarded the watch draft');
      [...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent.includes('保存备注')).click();
      await waitFor(() => document.getElementById('edit-watch-note')?.disabled === true, 'The retry did not lock the watch draft');
    })()`)
    if (!finish) throw new Error('The watch retry did not reach IPC')
    const succeed: (fail?: boolean) => void = finish
    succeed()
    await window.webContents.executeJavaScript(`(async () => {
      ${wait}
      await waitFor(() => !document.getElementById('edit-watch-note'), 'The successful watch save did not close the editor');
    })()`)
    if (!service.state().watchlist.some(entry => entry.note === 'Pending watch note regression')) throw new Error('The watch retry did not persist its submitted note')
    return { simulated: true, pendingDraftLocked: true, failedDraftRetained: true, retryPersisted: true }
  } finally {
    if (finish) { const cancel: (fail?: boolean) => void = finish; cancel(true) }
    ipcMain.removeHandler('radar:watch')
    register('radar:watch', input => service.setWatch(input as WatchInput))
    service.setWatch(original)
    await window.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`)
  }
}
