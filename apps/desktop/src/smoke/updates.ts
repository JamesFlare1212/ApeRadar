import type { BrowserWindow } from 'electron'
import type { UpdateState } from '@aperadar/shared/updates'

export async function validateUpdatePresentation(window: BrowserWindow, original: UpdateState) {
  async function waitFor(expression: string, message: string) {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await window.webContents.executeJavaScript(expression)) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(message)
  }
  // Exercise renderer states only; the updater stays disabled and no update actions run.
  const fixture = { ...original, mode: 'installed' as const, disabledReason: null, error: null, errorContext: null, availableVersion: '99.0.0' }
  try {
    window.webContents.send('radar:updates-changed', { ...fixture, status: 'downloading', downloadPercent: 64 })
    await waitFor("document.querySelector('.sidebar-update [data-slot=progress]')?.getAttribute('aria-valuenow')==='64' && document.querySelector('.sidebar-update button')?.disabled", 'The update progress value did not render')
    const indicator = await window.webContents.executeJavaScript("document.querySelector('.sidebar-update [data-slot=progress-indicator]')?.style.transform")
    if (indicator !== 'translateX(-36%)') throw new Error('The update progress fill is incorrect')
    window.webContents.send('radar:updates-changed', { ...fixture, status: 'downloading', downloadPercent: null })
    await waitFor("document.querySelector('.sidebar-update [data-slot=progress]')?.getAttribute('data-state')==='indeterminate'", 'Indeterminate update progress did not render')
    window.webContents.send('radar:updates-changed', { ...fixture, status: 'checking', downloadPercent: null })
    await waitFor("!!document.querySelector('.sidebar-update svg.animate-spin') && document.querySelector('.sidebar-update button')?.getAttribute('aria-busy')==='true'", 'The update checking spinner did not render')
    window.webContents.send('radar:updates-changed', { ...fixture, status: 'downloaded', downloadPercent: 100 })
    await waitFor("!!document.querySelector('.sidebar-update [data-slot=badge]') && document.querySelector('.sidebar-update button')?.getAttribute('aria-label')==='重启并安装' && !document.querySelector('.sidebar-update button')?.disabled", 'The ready update badge did not render')
    return { simulated: true, determinateProgress: true, indeterminateProgress: true, checkingSpinner: true, readyBadge: true }
  } finally {
    window.webContents.send('radar:updates-changed', original)
    await waitFor("document.querySelector('.sidebar-update button')?.disabled === true", 'The original disabled updater UI did not restore')
  }
}
