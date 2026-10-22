import type { BrowserWindow } from 'electron'

export async function validateNarrowNavigation(window: BrowserWindow) {
  return window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (condition, message) => {
      for (let attempt = 0; attempt < 60; attempt++) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(message);
    };
    const trigger = document.querySelector('.titlebar-navigation');
    trigger.click();
    await waitFor(() => document.querySelector('#app-sidebar[role=dialog]'), 'The mobile navigation did not open');
    const sheet = document.querySelector('#app-sidebar');
    if (sheet.getBoundingClientRect().width > innerWidth) throw new Error('The mobile navigation is wider than the viewport');
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !document.querySelector('#app-sidebar[role=dialog]'), 'The mobile navigation did not close with Escape');
    await waitFor(() => document.activeElement === trigger, 'Mobile navigation did not restore trigger focus');
    trigger.click();
    await waitFor(() => document.querySelector('#app-sidebar[role=dialog]'), 'The mobile navigation did not reopen');
    document.querySelector('#app-sidebar [aria-label=常规]').click();
    await waitFor(() => document.getElementById('rate-mode') && !document.querySelector('#app-sidebar[role=dialog]'), 'Selecting a mobile navigation item did not navigate and close');
    return { escapeAndFocus: true, navigateAndClose: true };
  })()`)
}
