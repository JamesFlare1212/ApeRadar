import type { BrowserWindow } from 'electron'

export async function validateUi(window: BrowserWindow) {
  return window.webContents.executeJavaScript(`(async () => {
    const api = window.aperadar;
    const original = (await api.getState()).settings;
    const waitFor = async (condition, message) => {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (await condition()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(typeof message === 'function' ? message() : message);
    };
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const fill = (element, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const openMenu = element => {
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', ctrlKey: false }));
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }));
      element.click();
    };
    const result = {};
    try {
      location.hash = '/overview';
      await waitFor(() => document.querySelectorAll('.player-table tbody tr').length === 24, 'The roster did not render');
      assert(document.querySelectorAll('[data-slot=table]').length === 2, 'The roster must use shadcn tables');

      const sidebar = document.querySelector('[data-slot=sidebar][data-state]');
      const sidebarState = sidebar.getAttribute('data-state');
      const sidebarTrigger = document.querySelector('[data-slot=sidebar-header] [data-slot=sidebar-trigger]');
      sidebarTrigger.click();
      await waitFor(() => sidebar.getAttribute('data-state') !== sidebarState, 'The sidebar did not toggle');
      assert(localStorage.getItem('aperadar.sidebar') === sidebar.getAttribute('data-state'), 'The sidebar preference was not persisted');
      sidebarTrigger.click();
      await waitFor(() => sidebar.getAttribute('data-state') === sidebarState, 'The sidebar did not restore');
      result.sidebarPreference = true;

      const roster = (await api.getState()).battle.players;
      const rosterButtons = [...document.querySelectorAll('.player-name-button')];
      const expectedOrder = ['ally', 'enemy'].flatMap(team => roster.filter(player => player.team === team));
      assert(rosterButtons.every((button, index) => button.getAttribute('aria-label').startsWith(expectedOrder[index].name + ' ·')), 'The roster no longer preserves imported player order');
      result.rosterOrder = true;
      const publicPlayers = roster.filter(player => player.status === 'ready' && player.stats?.overall.battles > 0);
      await waitFor(() => document.querySelectorAll('.winrate-point').length === publicPlayers.length, 'The chart lost public player samples');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const chartPoint = document.querySelector('.winrate-point');
      chartPoint.focus();
      // A hidden Electron window updates activeElement without reliably emitting SVG focus events.
      chartPoint.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await waitFor(() => [...document.querySelectorAll('[role=tooltip]')].some(element => element.textContent.includes('%')), () => 'The chart tooltip did not open on focus: ' + JSON.stringify({ connected: chartPoint.isConnected, focused: document.activeElement?.outerHTML?.slice(0, 180), describedBy: document.querySelector('.winrate-point')?.getAttribute('aria-describedby'), tooltips: [...document.querySelectorAll('[role=tooltip]')].map(element => element.textContent) }));
      const chartKey = chartPoint.getAttribute('data-team');
      const rates = [...document.querySelectorAll('.winrate-point[data-team=' + chartKey + ']')].map(point => Number(point.getAttribute('data-rate')));
      assert(rates.every((rate, index) => index === 0 || rate >= rates[index - 1]), 'The chart team order is incorrect');
      chartPoint.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(() => !document.querySelector('[role=tooltip]'), 'The chart tooltip did not close with Escape');
      chartPoint.blur();
      result.chartRankingAndKeyboardTooltip = true;

      const player = document.querySelector('.player-name-button');
      player.focus(); player.click();
      await waitFor(() => document.querySelector('[role=dialog]'), 'Player details did not open');
      const shipTab = [...document.querySelectorAll('[role=tab]')].find(element => element.textContent === '单船统计');
      shipTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false }));
      await waitFor(() => shipTab.getAttribute('aria-selected') === 'true', 'Player statistics tab did not change');
      assert(document.querySelector('[role=tabpanel]')?.textContent.includes('单船场均'), 'Ship statistics did not render');
      document.querySelector('[aria-label=关闭窗口]').click();
      await waitFor(() => !document.querySelector('[role=dialog]'), 'Player details did not close');
      await waitFor(() => document.activeElement === player, 'Dialog focus did not return to the player');
      result.playerDialogAndTabs = true;

      const bodyOverflow = document.body.style.overflow;
      openMenu(document.querySelector('.player-table [data-slot=dropdown-menu-trigger]'));
      await waitFor(() => document.querySelector('[role=menu]'), 'The watch menu did not open');
      assert(document.body.style.overflow === bodyOverflow, 'The watch menu locked page scrolling');
      document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(() => !document.querySelector('[role=menu]'), 'The watch menu did not close with Escape');
      result.watchMenuKeyboardAndScrolling = true;

      const weighted = [...document.querySelectorAll('[data-slot=toggle-group-item]')].find(element => element.textContent === '加权胜率');
      weighted.click();
      await waitFor(async () => (await api.getState()).settings.winrate === 'weighted', 'Win-rate selection was not saved');
      result.winrateSelection = true;

      location.hash = '/settings/general';
      await waitFor(() => document.getElementById('rate-mode'), 'General settings did not render');
      const toggle = document.querySelector('[role=switch]');
      const wasChecked = toggle.getAttribute('aria-checked') === 'true';
      toggle.click();
      await waitFor(async () => (await api.getState()).settings.showNames === !wasChecked, 'The switch change was not autosaved');
      result.switchAutosave = true;

      location.hash = '/overview';
      await waitFor(() => document.querySelector('.winrate-point'), 'The private chart did not render');
      assert([...document.querySelectorAll('.winrate-point')].every(point => publicPlayers.every(player => !point.getAttribute('aria-label').includes(player.name))), 'The chart exposed a hidden player name');
      result.chartPrivacy = true;

      location.hash = '/settings/appearance';
      await waitFor(() => document.getElementById('theme-dark'), 'The theme radios did not render');
      const darkRadio = document.getElementById('theme-dark');
      darkRadio.click(); darkRadio.focus();
      darkRadio.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await waitFor(() => document.activeElement?.id === 'theme-light', 'The radio arrow key did not move focus');
      document.activeElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await waitFor(async () => (await api.getState()).settings.theme === 'light', 'Theme selection did not respond to the arrow key');
      document.getElementById('palette-cyan').click();
      await waitFor(async () => { const settings = (await api.getState()).settings; return settings.lightPalette === 'cyan' && settings.darkPalette === 'cyan'; }, 'The palette pair was not saved');
      assert(document.documentElement.dataset.palette === 'cyan', 'The selected palette was not applied');
      document.querySelector('[aria-label="紫夜 · 深色"]').click();
      await waitFor(async () => { const settings = (await api.getState()).settings; return settings.lightPalette === 'cyan' && settings.darkPalette === 'violet' && settings.theme === 'light'; }, 'The dark swatch changed the light palette or theme');
      document.querySelector('[aria-label="森林 · 浅色"]').click();
      await waitFor(async () => { const settings = (await api.getState()).settings; return settings.lightPalette === 'forest' && settings.darkPalette === 'violet' && settings.theme === 'light'; }, 'The light swatch changed the dark palette or theme');
      assert(document.querySelector('[aria-label="森林 · 浅色"]').getAttribute('aria-pressed') === 'true' && document.querySelector('[aria-label="紫夜 · 深色"]').getAttribute('aria-pressed') === 'true', 'Independent palette selections are not indicated');
      document.getElementById('palette-cyan').click();
      await waitFor(async () => { const settings = (await api.getState()).settings; return settings.lightPalette === 'cyan' && settings.darkPalette === 'cyan' && settings.theme === 'light'; }, 'Selecting a palette pair did not restore both swatches');
      result.appearanceRadioKeyboardAndPalette = true;

      location.hash = '/settings/connection';
      await waitFor(() => document.getElementById('api-type'), 'Connection settings did not render');
      const source = document.getElementById('api-type');
      openMenu(source);
      await waitFor(() => document.querySelector('[role=listbox]'), 'The API source select did not open');
      const option = [...document.querySelectorAll('[role=option]')].find(element => element.textContent === 'Vortex');
      option.focus(); option.click();
      await waitFor(async () => (await api.getState()).settings.api === 'VORTEX', 'The source selection was not autosaved');
      assert(source.getAttribute('data-value') === 'VORTEX', 'The source label is stale');
      result.selectAutosave = true;

      const cache = document.getElementById('cache-minutes');
      const previousCache = (await api.getState()).settings.cacheMinutes;
      fill(cache, '0');
      await waitFor(() => document.getElementById('cache-minutes-error')?.getAttribute('role') === 'alert', 'The field error did not render');
      assert(cache.getAttribute('aria-invalid') === 'true' && cache.getAttribute('aria-describedby').includes('cache-minutes-error'), 'The field error is not associated with its input');
      assert((await api.getState()).settings.cacheMinutes === previousCache, 'An invalid field value was persisted');
      fill(cache, String(previousCache));
      await waitFor(() => !document.getElementById('cache-minutes-error'), 'The corrected field error did not clear');
      result.fieldErrorRecovery = true;

      location.hash = '/settings/ratings';
      await waitFor(() => document.getElementById('ape-min'), 'Rating settings did not render');
      const minimumBattles = (await api.getState()).settings.minApeBattles;
      fill(document.getElementById('ape-min'), '');
      await waitFor(() => document.getElementById('ape-min-error'), 'An empty numeric field was treated as zero');
      assert((await api.getState()).settings.minApeBattles === minimumBattles, 'An empty numeric field was persisted');
      fill(document.getElementById('ape-min'), String(minimumBattles));
      await waitFor(() => !document.getElementById('ape-min-error'), 'The numeric field did not recover');
      result.emptyNumericField = true;

      location.hash = '/overview';
      await waitFor(() => document.querySelector('[aria-label=搜索阵容]'), 'The roster search did not render');
      const rosterSearch = document.querySelector('[aria-label=搜索阵容]');
      fill(rosterSearch, 'no-matching-ship-xyz');
      await waitFor(() => !document.querySelector('.player-table tbody tr'), 'The roster search did not filter both teams');
      fill(rosterSearch, '大和');
      await waitFor(() => document.querySelectorAll('.player-table tbody tr').length === 2, 'The ship search did not find both teams');
      fill(rosterSearch, '');
      await waitFor(() => document.querySelectorAll('.player-table tbody tr').length === 24, 'Clearing the roster search did not restore the roster');
      openMenu(document.querySelector('[aria-label=筛选舰种]'));
      await waitFor(() => document.querySelector('[role=listbox]'), 'The ship filter did not open');
      const destroyer = [...document.querySelectorAll('[role=option]')].find(element => element.textContent === '驱逐舰');
      destroyer.focus(); destroyer.click();
      const destroyerCount = (await api.getState()).battle.players.filter(player => player.ship.type === 'Destroyer').length;
      await waitFor(() => document.querySelectorAll('.player-table tbody tr').length === destroyerCount, 'The ship filter did not preserve the matching players');
      result.rosterSearchAndShipFilter = true;

      const beforeImport = (await api.getState()).settings;
      await api.saveSettings({ ...beforeImport, region: 'ASIA', autoQuery: false });
      const arena = { matchGroup: 'pvp', mapName: 'Smoke_Test_Waters_'.repeat(8), dateTime: '22.10.2026 12:00:00', vehicles: [{ id: 42, name: 'SmokeCaptain', relation: 0, shipId: roster[0].ship.id }] };
      await api.importArena({ name: 'smoke-history.json', base64: btoa(JSON.stringify(arena)) });
      await api.loadDemo();
      await api.saveSettings(beforeImport);
      location.hash = '/history';
      await waitFor(() => document.querySelector('a[aria-label^="回看 "]'), 'Imported history did not render');
      const historySearch = document.querySelector('[aria-label=搜索历史对局]');
      fill(historySearch, 'no-matching-map-xyz');
      await waitFor(() => !document.querySelector('a[aria-label^="回看 "]') && document.querySelector('[data-slot=empty]'), 'The history search did not filter records');
      fill(historySearch, '');
      await waitFor(() => document.querySelector('a[aria-label^="回看 "]'), 'Clearing history search did not restore records');
      document.querySelector('a[aria-label^="回看 "]').click();
      await waitFor(() => location.hash === '#/overview' && document.querySelectorAll('.player-table tbody tr').length === 1, 'Loading history did not restore its roster');
      await api.loadDemo();
      result.historyImportSearchAndLoad = true;

      location.hash = '/watchlist';
      await waitFor(() => document.querySelector('[aria-label=搜索关注名单]') && document.querySelector('[data-slot=item]'), 'The watch list did not use Item');
      const search = document.querySelector('[aria-label=搜索关注名单]');
      fill(search, 'no-matching-captain-xyz');
      await waitFor(() => document.querySelector('[data-slot=empty]'), 'The filtered list did not show Empty');
      fill(search, '');
      await waitFor(() => document.querySelector('[data-slot=item]'), 'Clearing the search did not restore the list');
      result.listItemsAndEmptyState = true;

      const watched = (await api.getState()).watchlist[0];
      const watchCount = (await api.getState()).watchlist.length;
      const removeWatch = document.querySelector('[aria-label^="移除 "]');
      removeWatch.focus(); removeWatch.click();
      await waitFor(() => document.querySelector('[role=alertdialog]'), 'Removing a watch did not open an alert dialog');
      await waitFor(() => document.activeElement?.textContent === '保留记录', 'The confirmation did not focus the safe action');
      document.activeElement.click();
      await waitFor(() => !document.querySelector('[role=alertdialog]'), 'Cancelling the removal did not close the alert');
      await waitFor(() => document.activeElement === removeWatch, 'The confirmation did not restore focus');
      assert((await api.getState()).watchlist.length === watchCount, 'Cancelling deleted a watch entry');
      removeWatch.click();
      await waitFor(() => document.querySelector('[role=alertdialog]'), 'The confirmation did not reopen');
      [...document.querySelectorAll('[role=alertdialog] button')].find(button => button.textContent === '移除关注').click();
      await waitFor(async () => !document.querySelector('[role=alertdialog]') && (await api.getState()).watchlist.length === watchCount - 1, 'The confirmed removal did not complete');
      await waitFor(() => document.activeElement === document.querySelector('main h1'), 'Deleting the trigger did not restore focus to the page');
      await api.setWatch(watched);
      result.watchRemovalConfirmation = true;

      location.hash = '/help';
      await waitFor(() => document.querySelector('[data-slot=accordion-trigger]'), 'Help did not render');
      const questions = document.querySelectorAll('[data-slot=accordion-trigger]');
      questions[1].click();
      await waitFor(() => questions[1].getAttribute('aria-expanded') === 'true', 'The FAQ did not expand');
      assert(questions[0].getAttribute('aria-expanded') === 'false', 'The previous FAQ did not collapse');
      result.helpAccordion = true;

      document.querySelector('.skip-link').click();
      assert(location.hash === '#/help' && document.activeElement?.id === 'main-content', 'The skip link changed the current route or failed to move focus');
      result.skipLinkPreservesRoute = true;
    } catch (error) {
      throw new Error('UI checks failed after ' + Object.keys(result).join(', ') + ': ' + (error?.stack || String(error)));
    } finally {
      await api.saveSettings(original);
      location.hash = '/overview';
      await waitFor(() => document.querySelector('.player-table'), 'The workspace did not restore');
    }
    return result;
  })()`)
}
