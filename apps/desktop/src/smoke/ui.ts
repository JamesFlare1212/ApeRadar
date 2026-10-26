import type { BrowserWindow } from 'electron'
import type { Battle } from '@aperadar/shared/types'
import type { RadarDatabase } from '@aperadar/server/database'
import { sortRosterPlayers } from '@aperadar/shared/roster'

export async function validateUi(window: BrowserWindow, database: RadarDatabase) {
  const initialBattle = await window.webContents.executeJavaScript('window.aperadar.getState().then(state => state.battle)') as Battle
  const initialRoster = initialBattle.players
  database.saveBattle({ ...initialBattle, id: 'smoke-history-snapshot', sourceName: 'tempArenaInfo.json', isDemo: false, map: 'Smoke_Test_Waters_'.repeat(8), players: initialRoster.slice(0, 1) })
  const expectedRosterKeys = (['ally', 'enemy'] as const).flatMap(team => sortRosterPlayers(initialRoster.filter(player => player.team === team)).map(player => player.key))
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
      assert(typeof api.openFile === 'undefined' && typeof api.importArena === 'undefined', 'The renderer still exposes manual file import');
      assert(!document.querySelector('input[type=file], .drop-overlay') && ![...document.querySelectorAll('button')].some(button => button.textContent.includes('打开阵容')), 'The removed manual file import UI is still present');
      result.manualFileImportRemoved = true;

      const shell = document.querySelector('.app-shell');
      const shellBounds = shell.getBoundingClientRect();
      const workspace = document.getElementById('main-content');
      const inset = document.querySelector('[data-slot=sidebar-inset]');
      const insetBounds = inset.getBoundingClientRect();
      assert(shellBounds.left === 0 && shellBounds.top === 0 && shellBounds.right === innerWidth && shellBounds.bottom === innerHeight, 'The application surface does not fill the window');
      assert(getComputedStyle(shell).overflow === 'hidden', 'Content must stay inside the native application perimeter');
      assert(Math.abs(insetBounds.top - 1) < .5 && Math.abs(insetBounds.right - (innerWidth - 1)) < .5 && Math.abs(insetBounds.bottom - (innerHeight - 1)) < .5 && getComputedStyle(inset).margin === '0px', 'The workspace still has an inset outer shell');
      assert(document.documentElement.scrollHeight <= innerHeight && getComputedStyle(workspace).overflowY === 'auto', 'Workspace scrolling must stay inside the application surface');
      result.applicationSurfaceFillsWindow = true;

      const sidebar = document.querySelector('[data-slot=sidebar][data-state]');
      const sidebarState = sidebar.getAttribute('data-state');
      const sidebarTrigger = document.querySelector('.app-titlebar [data-sidebar=trigger]');
      assert(sidebarTrigger && !document.querySelector('[data-slot=sidebar-header] [data-sidebar=trigger]'), 'The sidebar toggle must remain in the content header');
      assert(!document.querySelector('#app-sidebar [aria-label="打开阵容文件"]'), 'The removed sidebar import action is still present');
      assert(![...document.querySelectorAll('.roster-actions button')].some(button => button.textContent.includes('导出 CSV')), 'The removed roster CSV action is still present');
      const container = document.getElementById('app-sidebar');
      const measureSidebar = () => {
        const rect = container.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, top: rect.top,
          brandTop: container.querySelector('.sidebar-brand').getBoundingClientRect().top,
          navigationTop: container.querySelector('.sidebar-main-navigation button').getBoundingClientRect().top,
          footerTop: container.querySelector('[data-slot=sidebar-footer]').getBoundingClientRect().top,
          headerTop: document.querySelector('.app-titlebar').getBoundingClientRect().top,
          gapWidth: document.querySelector('[data-slot=sidebar-gap]').getBoundingClientRect().width,
          contentLeft: document.querySelector('[data-slot=sidebar-inset]').getBoundingClientRect().left };
      };
      const sidebarMotion = document.createElement('style');
      sidebarMotion.textContent = '.app-sidebar { transition: left 200ms linear, right 200ms linear !important; } [data-slot=sidebar-gap] { transition: width 200ms linear !important; }';
      document.head.append(sidebarMotion);
      await new Promise(resolve => requestAnimationFrame(resolve));
      const beforeSidebar = measureSidebar();
      sidebarTrigger.click();
      await waitFor(() => sidebar.getAttribute('data-state') !== sidebarState, 'The sidebar did not toggle');
      container.getBoundingClientRect();
      const slide = container.getAnimations().find(animation => animation instanceof CSSTransition && ['left', 'right'].includes(animation.transitionProperty));
      assert(slide, 'The sidebar did not create a horizontal CSS transition');
      // Seek the real transition so hidden-window frame timing cannot skip its midpoint.
      slide.pause();
      slide.currentTime = 100;
      const movingSidebar = measureSidebar();
      const sidebarOrigin = shellBounds.left + shell.clientLeft;
      const targetLeft = sidebarOrigin - (sidebar.getAttribute('data-state') === 'collapsed' ? beforeSidebar.width : 0);
      assert(Math.abs(movingSidebar.left - beforeSidebar.left) > .5 && Math.abs(movingSidebar.left - targetLeft) > .5, 'The sidebar did not animate horizontally');
      for (const animation of [...container.getAnimations(), ...document.querySelector('[data-slot=sidebar-gap]').getAnimations()]) animation.finish();
      await waitFor(() => Math.abs(container.getBoundingClientRect().left - targetLeft) < .5, 'The sidebar slide did not finish');
      await waitFor(() => Math.abs(document.querySelector('[data-slot=sidebar-gap]').getBoundingClientRect().width - (sidebar.getAttribute('data-state') === 'expanded' ? beforeSidebar.width : 0)) < .5, 'The sidebar layout gap did not finish sliding');
      sidebarMotion.remove();
      assert(localStorage.getItem('aperadar.sidebar') === sidebar.getAttribute('data-state'), 'The sidebar preference was not persisted');
      assert(sidebarTrigger.getAttribute('aria-expanded') === String(sidebar.getAttribute('data-state') === 'expanded'), 'The header toggle did not announce the sidebar state');
      const afterSidebar = measureSidebar();
      for (const key of ['width', 'top', 'brandTop', 'navigationTop', 'footerTop', 'headerTop']) {
        assert(Math.abs(beforeSidebar[key] - afterSidebar[key]) < .5 && Math.abs(beforeSidebar[key] - movingSidebar[key]) < .5, 'Toggling the sidebar changed its vertical layout or width: ' + key);
      }
      const collapsedSidebar = sidebar.getAttribute('data-state') === 'collapsed' ? afterSidebar : beforeSidebar;
      const expandedSidebar = sidebar.getAttribute('data-state') === 'expanded' ? afterSidebar : beforeSidebar;
      assert(collapsedSidebar.right <= sidebarOrigin + .5 && collapsedSidebar.gapWidth < .5 && collapsedSidebar.contentLeft <= sidebarOrigin + .5, 'The collapsed sidebar leaves a mini rail or reserved space');
      assert(expandedSidebar.left >= 0 && expandedSidebar.gapWidth > 100, 'The expanded sidebar did not restore its width');
      if (sidebar.getAttribute('data-state') === 'collapsed') {
        sidebarTrigger.focus();
        container.querySelector('.sidebar-brand').focus();
        assert(container.inert && document.activeElement === sidebarTrigger, 'The hidden sidebar still accepts keyboard focus');
      }
      const assertSidebarControlsVisible = () => {
        if (sidebar.getAttribute('data-state') === 'collapsed') return;
        const rail = container.getBoundingClientRect();
        const controls = document.querySelectorAll('#app-sidebar .sidebar-brand, #app-sidebar .sidebar-main-navigation button, #app-sidebar .sidebar-connection, #app-sidebar [aria-label=偏好设置], #app-sidebar .sidebar-update button');
        assert([...controls].every(control => {
          const rect = control.getBoundingClientRect();
          return rect.width >= 24 && rect.height >= 24 && rect.left >= rail.left && rect.right <= rail.right && rect.top >= 0 && rect.bottom <= innerHeight;
        }), 'A sidebar control is clipped or too small after toggling');
      };
      assertSidebarControlsVisible();
      sidebarTrigger.click();
      await waitFor(() => sidebar.getAttribute('data-state') === sidebarState, 'The sidebar did not restore');
      assertSidebarControlsVisible();
      result.sidebarPreference = true;
      result.sidebarOffcanvasWithoutVerticalShift = true;
      result.removedSidebarImportAndRosterExport = true;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
      await waitFor(() => sidebar.getAttribute('data-state') !== sidebarState, 'The sidebar keyboard shortcut did not toggle');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
      await waitFor(() => sidebar.getAttribute('data-state') === sidebarState, 'The sidebar keyboard shortcut did not restore');
      result.sidebarHeaderAndKeyboardToggle = true;

      const roster = (await api.getState()).battle.players;
      const rosterButtons = [...document.querySelectorAll('.player-name-button')];
      const expectedOrder = ${JSON.stringify(expectedRosterKeys)}.map(key => roster.find(player => player.key === key));
      assert(rosterButtons.every((button, index) => button.getAttribute('aria-label').startsWith(expectedOrder[index].name + ' ·')), 'The roster does not follow game-style ship order');
      result.rosterOrder = true;
      assert([...document.querySelectorAll('.player-hidden')].every(row => {
        const identity = row.querySelector('.player-identity').getBoundingClientRect();
        const firstCell = row.cells[0].getBoundingClientRect();
        const actionCell = row.cells[row.cells.length - 1].getBoundingClientRect();
        return identity.right > firstCell.right + 24 && identity.right <= actionCell.left && identity.width > 0;
      }), 'Hidden-player identities do not use the empty statistics space or overlap watch actions');
      result.hiddenIdentityUsesEmptyStatistics = true;
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
      assert(document.querySelector('[role=dialog] [role=tabpanel]')?.textContent.includes('单船场均'), 'Ship statistics did not render');

      const captain = expectedOrder[0];
      const findWatch = async () => (await api.getState()).watchlist.find(entry => entry.region === captain.region && entry.accountId === captain.accountId);
      const originalWatch = await findWatch();
      const watchButton = label => [...document.querySelectorAll('[role=dialog] [data-slot=toggle-group-item]')].find(button => button.textContent === label);
      const isSelected = button => button?.getAttribute('data-state') === 'on';
      const alertButton = label => [...document.querySelectorAll('[role=alertdialog] button')].find(button => button.textContent === label);
      const confirmRemoval = async () => {
        await waitFor(() => document.querySelector('[role=alertdialog]'), 'Watch removal did not ask for confirmation');
        alertButton('移除关注').click();
        await waitFor(() => !document.querySelector('[role=alertdialog]'), 'Watch removal confirmation did not close');
      };
      const selectedWatch = document.querySelector('[role=dialog] [data-slot=toggle-group-item][data-state=on]');
      if (selectedWatch) {
        selectedWatch.click();
        await confirmRemoval();
        await waitFor(async () => !(await findWatch()), 'The confirmed watch mark did not toggle off');
      }
      const noteInput = document.querySelector('#player-watch-note');
      for (const [label, status] of [['值得信赖', 'positive'], ['需要留意', 'negative'], ['疑似异常', 'suspected']]) {
        fill(noteInput, 'Toggle regression note');
        const button = watchButton(label);
        button.click();
        await waitFor(async () => isSelected(button) && (await findWatch())?.status === status && !button.disabled, 'The watch mark did not persist: ' + status);
        assert((await findWatch()).note === 'Toggle regression note', 'Selecting a watch mark lost the note');
        button.click();
        await waitFor(() => document.querySelector('[role=alertdialog]'), 'Removing the selected type did not require confirmation');
        assert((await findWatch())?.note === 'Toggle regression note', 'Opening removal confirmation deleted the note');
        alertButton('保留记录').click();
        await waitFor(() => !document.querySelector('[role=alertdialog]'), 'Cancelling watch removal did not close confirmation');
        assert(isSelected(button) && (await findWatch())?.status === status, 'Cancelling watch removal lost the saved mark');
        button.click();
        await confirmRemoval();
        await waitFor(async () => !(await findWatch()) && !isSelected(button), 'Confirmed removal did not delete the watch: ' + status);
        assert(noteInput.value === '', 'Confirmed deletion left the deleted note in the editor');
      }
      watchButton('值得信赖').click();
      await waitFor(() => isSelected(watchButton('值得信赖')) && !watchButton('值得信赖').disabled, 'The positive mark did not select');
      watchButton('值得信赖').focus();
      watchButton('值得信赖').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await waitFor(() => document.activeElement === watchButton('需要留意'), 'The watch type group did not support arrow-key navigation');
      watchButton('需要留意').click();
      await waitFor(async () => (await findWatch())?.status === 'negative' && isSelected(watchButton('需要留意')) && !watchButton('需要留意').disabled, 'Switching watch marks did not replace the selection');
      const saveNote = () => [...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent === '保存备注');
      fill(noteInput, 'Independent note regression');
      await waitFor(() => !saveNote().disabled, 'Editing an existing note did not enable its save button');
      saveNote().click();
      await waitFor(async () => (await findWatch())?.note === 'Independent note regression' && !watchButton('需要留意').disabled, 'Saving a note without changing its mark failed');
      fill(noteInput, 'Unsaved detail regression');
      document.querySelector('[role=dialog] [aria-label=关闭窗口]').click();
      await waitFor(() => document.querySelector('[role=alertdialog]'), 'Closing unsaved notes did not ask for confirmation');
      assert((await findWatch())?.note === 'Independent note regression', 'An unsaved note was committed implicitly');
      alertButton('继续编辑').click();
      await waitFor(() => !document.querySelector('[role=alertdialog]'), 'Returning to the note editor did not close confirmation');
      assert(noteInput.value === 'Unsaved detail regression', 'Cancelling close lost the note draft');
      saveNote().click();
      await waitFor(async () => (await findWatch())?.note === 'Unsaved detail regression' && !watchButton('需要留意').disabled, 'The preserved note draft did not save');
      result.playerWatchToggleAndPersistence = true;
      result.independentNoteSaveAndUnsavedClose = true;

      document.querySelector('[aria-label=关闭窗口]').click();
      await waitFor(() => !document.querySelector('[role=dialog]'), 'Player details did not close');
      await waitFor(() => document.activeElement === player, 'Dialog focus did not return to the player');
      result.playerDialogAndTabs = true;
      await api.setWatch(originalWatch ?? { region: captain.region, accountId: captain.accountId, name: captain.name, status: null });

      const bodyOverflow = document.body.style.overflow;
      openMenu(document.querySelector('.player-table [data-slot=dropdown-menu-trigger]'));
      await waitFor(() => document.querySelector('[role=menu]'), 'The watch menu did not open');
      assert(document.body.style.overflow === bodyOverflow, 'The watch menu locked page scrolling');
      document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(() => !document.querySelector('[role=menu]'), 'The watch menu did not close with Escape');
      result.watchMenuKeyboardAndScrolling = true;

      const watchTrigger = document.querySelector('.player-table [data-slot=dropdown-menu-trigger]');
      const selectWatchOption = async label => {
        openMenu(watchTrigger);
        await waitFor(() => document.querySelector('[role=menu]'), 'The watch menu did not open for selection');
        [...document.querySelectorAll('[role=menuitem]')].find(item => item.textContent === label).click();
        await waitFor(() => !document.querySelector('[role=menu]'), 'Selecting a watch option did not close the menu');
      };
      for (const [label, status] of [['值得信赖', 'positive'], ['需要留意', 'negative'], ['疑似异常', 'suspected']]) {
        await api.setWatch({ region: captain.region, accountId: captain.accountId, name: captain.name, status, note: 'Menu toggle regression note' });
        await waitFor(() => watchTrigger.classList.contains('watch-' + status), 'The watch menu trigger did not reflect its saved mark');
        await selectWatchOption(label);
        await waitFor(() => document.querySelector('[role=alertdialog]'), 'The menu removed a mark without confirmation');
        assert((await findWatch())?.note === 'Menu toggle regression note', 'The menu deleted a note before confirmation');
        await confirmRemoval();
        await waitFor(async () => !(await findWatch()) && watchTrigger.classList.contains('muted'), 'Selecting the checked menu option did not remove the mark: ' + status);
      }
      await selectWatchOption('值得信赖');
      await waitFor(async () => (await findWatch())?.status === 'positive' && watchTrigger.classList.contains('watch-positive'), 'The menu did not add a watch mark');
      await selectWatchOption('需要留意');
      await waitFor(async () => (await findWatch())?.status === 'negative' && watchTrigger.classList.contains('watch-negative'), 'The menu did not switch watch marks');
      await api.setWatch(originalWatch ?? { region: captain.region, accountId: captain.accountId, name: captain.name, status: null });
      result.watchMenuToggleAndPersistence = true;

      const winrateTabs = document.querySelector('[role=tablist][aria-label=胜率显示口径]');
      const account = [...winrateTabs.querySelectorAll('[role=tab]')].find(element => element.textContent === '账号胜率');
      const weighted = [...winrateTabs.querySelectorAll('[role=tab]')].find(element => element.textContent === '加权胜率');
      weighted.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false }));
      await waitFor(async () => (await api.getState()).settings.winrate === 'weighted' && weighted.getAttribute('aria-selected') === 'true', 'Win-rate tab selection was not saved');
      assert([...document.querySelectorAll('.player-name-button')].every((button, index) => button.getAttribute('aria-label').startsWith(expectedOrder[index].name + ' ·')), 'Changing the win-rate metric moved roster rows');
      const weightedPanel = document.getElementById(weighted.getAttribute('aria-controls'));
      assert(weightedPanel?.getAttribute('aria-labelledby') === weighted.id && weightedPanel.querySelectorAll('.player-table tbody tr').length === 24, 'The selected win-rate tab is not associated with the full roster');
      assert([...document.querySelectorAll('.team-winrate')].every(element => element.getAttribute('aria-label').includes('加权胜率')), 'Team summaries did not use the selected win-rate mode');
      weighted.focus();
      weighted.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await waitFor(() => document.activeElement === account, 'The win-rate arrow key did not move focus');
      account.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await waitFor(async () => (await api.getState()).settings.winrate === 'account' && account.getAttribute('aria-selected') === 'true', 'Keyboard win-rate selection was not saved');
      assert([...document.querySelectorAll('.team-winrate')].every(element => element.getAttribute('aria-label').includes('账号胜率')), 'Team summaries did not restore account win rates');
      result.winrateTabsKeyboardAndPersistence = true;

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

      const measureSelectLayout = trigger => {
        const elements = [document.querySelector('.main-inner'), trigger.closest('[data-slot=card]'), trigger];
        const header = document.querySelector('.app-titlebar').getBoundingClientRect();
        return [...elements.flatMap(element => { const rect = element.getBoundingClientRect(); return [rect.left, rect.width]; }), header.top, header.bottom];
      };
      for (const [section, id] of [['appearance', 'interface-font'], ['appearance', 'interface-font-size'], ['connection', 'region']]) {
        location.hash = '/settings/' + section;
        await waitFor(() => document.getElementById(id), 'Select settings did not render: ' + id);
        if (section === 'connection') {
          await waitFor(() => !document.querySelector('.game-client-settings [aria-busy=true]') && !document.getElementById('game-path-status')?.textContent.includes('正在验证'), 'Game-client discovery did not finish before measuring the select layout');
        }
        await document.fonts.ready;
        const trigger = document.getElementById(id);
        trigger.scrollIntoView({ block: 'center' });
        assert(workspace.scrollTop > 0, 'The header regression requires a scrolled workspace');
        assert(Math.abs(document.querySelector('.app-titlebar').getBoundingClientRect().top - 1) < .5, 'The header was not pinned before opening the select');
        assert(workspace.scrollHeight > workspace.clientHeight && document.documentElement.scrollHeight <= innerHeight, 'The scrollbar regression requires scrolling inside the workspace');
        const scrollbar = { width: workspace.offsetWidth - workspace.clientWidth, height: workspace.scrollHeight, top: workspace.scrollTop };
        const before = measureSelectLayout(trigger);
        openMenu(trigger);
        await waitFor(() => document.querySelector('[role=listbox]') && document.body.hasAttribute('data-scroll-locked'), 'The typography menu did not lock background scrolling');
        const opened = measureSelectLayout(trigger);
        assert(opened.every((value, index) => Math.abs(value - before[index]) < .5), 'Opening the typography select shifted the layout: ' + JSON.stringify({ id, before, opened }));
        assert(workspace.offsetWidth - workspace.clientWidth === scrollbar.width && workspace.scrollHeight > workspace.clientHeight, 'Opening the select changed scrollbar visibility: ' + JSON.stringify({ id, before: scrollbar, width: workspace.offsetWidth - workspace.clientWidth, height: workspace.scrollHeight }));
        assert(Math.abs(workspace.scrollTop - scrollbar.top) < .5, 'Opening the typography select changed the workspace scroll position');
        const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
        document.body.dispatchEvent(wheel);
        assert(wheel.defaultPrevented, 'Background wheel scrolling was not blocked while the select was open');
        await waitFor(() => document.activeElement?.matches('[role=option]'), 'The typography select did not focus an option');
        const focusedOption = document.activeElement;
        focusedOption.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        await waitFor(() => document.activeElement !== focusedOption && document.activeElement?.matches('[role=option]'), 'Arrow navigation did not move to the next typography option');
        document.querySelector('[role=listbox]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await waitFor(() => !document.querySelector('[role=listbox]') && !document.body.hasAttribute('data-scroll-locked'), 'The typography menu did not release background scrolling');
        const closed = measureSelectLayout(trigger);
        assert(closed.every((value, index) => Math.abs(value - before[index]) < .5), 'Closing the typography select shifted the layout');
        assert(workspace.offsetWidth - workspace.clientWidth === scrollbar.width && workspace.scrollHeight > workspace.clientHeight, 'Closing the select changed scrollbar visibility: ' + JSON.stringify({ id, before: scrollbar, width: workspace.offsetWidth - workspace.clientWidth, height: workspace.scrollHeight }));
        await waitFor(() => document.activeElement === trigger, 'The typography select did not restore focus');
      }
      result.typographySelectLayoutStable = true;
      result.typographySelectScrollbarPreserved = true;
      result.regionSelectStickyHeaderPreserved = true;

      location.hash = '/settings/appearance';
      await waitFor(() => document.getElementById('interface-font'), 'Typography settings did not reopen');

      const chooseFontOption = async (id, label) => {
        openMenu(document.getElementById(id));
        await waitFor(() => document.querySelector('[role=listbox]'), 'The typography select did not open');
        const option = [...document.querySelectorAll('[role=option]')].find(element => element.textContent === label);
        assert(option, 'The typography option is missing: ' + label);
        option.focus(); option.click();
      };
      await chooseFontOption('interface-font', 'Segoe UI');
      await chooseFontOption('interface-font-size', '20 px');
      await waitFor(async () => { const settings = (await api.getState()).settings; return settings.fontFamily === 'Segoe UI' && settings.fontSize === 20; }, 'Typography was not autosaved');
      assert(Math.abs(parseFloat(getComputedStyle(document.body).fontSize) - 20) < .1, 'The interface font size was not applied');
      assert(getComputedStyle(document.querySelector('[aria-label="字体预览"] .numeric')).fontFamily.includes('Segoe UI'), 'Numeric text did not inherit the interface font');
      assert(JSON.parse(localStorage.getItem('aperadar.appearance')).fontSize === 20, 'Typography was not cached for startup');
      location.hash = '/overview';
      await waitFor(() => document.querySelector('.rate'), 'The roster did not reopen');
      assert(Math.abs(parseFloat(getComputedStyle(document.querySelector('.rate')).fontSize) - 20) < .1, 'Roster text did not scale with the interface');
      location.hash = '/settings/appearance';
      await waitFor(() => document.getElementById('interface-font'), 'Typography settings did not reopen');
      assert(document.getElementById('interface-font').textContent === 'Segoe UI', 'The saved font selection was lost');
      await chooseFontOption('interface-font', '自定义字体…');
      await waitFor(() => document.getElementById('custom-interface-font'), 'The custom font input did not render');
      fill(document.getElementById('custom-interface-font'), 'ApeRadar Unavailable Font');
      await waitFor(async () => (await api.getState()).settings.fontFamily === 'ApeRadar Unavailable Font', 'The custom font was not saved');
      assert(getComputedStyle(document.body).fontFamily.includes('Inter Variable'), 'Unavailable fonts have no default fallback');
      document.querySelector('[aria-label="重置字体与字号"]').click();
      await waitFor(async () => { const settings = (await api.getState()).settings; return settings.fontFamily === '' && settings.fontSize === 14; }, 'Typography reset was not saved');
      assert(Math.abs(parseFloat(getComputedStyle(document.body).fontSize) - 14) < .1, 'The default font size was not restored');
      assert((await api.getState()).settings.lightPalette === 'cyan', 'Typography reset changed unrelated appearance preferences');
      result.typographyPreviewAutosaveAndReset = true;

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

      let cache = document.getElementById('cache-minutes');
      const previousCache = (await api.getState()).settings.cacheMinutes;
      fill(cache, '0');
      await waitFor(() => document.getElementById('cache-minutes-error')?.getAttribute('role') === 'alert', 'The field error did not render');
      assert(cache.getAttribute('aria-invalid') === 'true' && cache.getAttribute('aria-describedby').includes('cache-minutes-error'), 'The field error is not associated with its input');
      assert((await api.getState()).settings.cacheMinutes === previousCache, 'An invalid field value was persisted');
      location.hash = '/settings/general';
      await waitFor(() => document.getElementById('rate-mode'), 'General settings did not retain the invalid draft');
      const errorLink = document.querySelector('#settings-save-error a');
      assert(errorLink?.textContent.includes('缓存时间'), 'The error summary did not identify the field in another section');
      errorLink.click();
      await waitFor(() => document.activeElement?.id === 'cache-minutes', 'The error summary did not navigate and focus the invalid control');
      cache = document.getElementById('cache-minutes');
      assert(cache.value === '0', 'Navigating to an error lost its invalid draft');
      result.errorSummarySectionAndFocus = true;
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
      await waitFor(() => document.querySelectorAll('.player-table tbody tr').length === 24, 'The full roster did not render after navigation');
      assert(!document.querySelector('[aria-label=搜索阵容], [aria-label=筛选舰种]'), 'Removed roster filters are still present');
      result.fullRosterWithoutFilters = true;

      location.hash = '/history';
      await waitFor(() => document.querySelector('a[aria-label^="回看 "]'), 'Saved history did not render');
      const historySearch = document.querySelector('[aria-label=搜索历史对局]');
      fill(historySearch, 'no-matching-map-xyz');
      await waitFor(() => !document.querySelector('a[aria-label^="回看 "]') && document.querySelector('[data-slot=empty]'), 'The history search did not filter records');
      [...document.querySelectorAll('[data-slot=empty-content] button')].find(button => button.textContent === '清除搜索').click();
      await waitFor(() => document.querySelector('a[aria-label^="回看 "]'), 'Clearing history search did not restore records');
      assert(document.activeElement === historySearch, 'Clearing history search did not restore input focus');
      document.querySelector('a[aria-label^="回看 "]').click();
      await waitFor(() => location.hash === '#/overview' && document.querySelectorAll('.player-table tbody tr').length === 1, 'Loading history did not restore its roster');
      await api.loadDemo();
      result.historySnapshotSearchAndLoad = true;

      location.hash = '/watchlist';
      await waitFor(() => document.querySelector('[aria-label=搜索关注名单]') && document.querySelector('[data-slot=item]'), 'The watch list did not use Item');
      const search = document.querySelector('[aria-label=搜索关注名单]');
      fill(search, 'no-matching-captain-xyz');
      await waitFor(() => document.querySelector('[data-slot=empty]'), 'The filtered list did not show Empty');
      [...document.querySelectorAll('[data-slot=empty-content] button')].find(button => button.textContent === '清除搜索与筛选').click();
      await waitFor(() => document.querySelector('[data-slot=item]'), 'Clearing the search did not restore the list');
      assert(document.activeElement === search, 'Clearing watch search did not restore input focus');
      result.listItemsAndEmptyState = true;

      const watchFilter = document.querySelector('[aria-label=关注类型]');
      assert(watchFilter?.getAttribute('data-slot') === 'select-trigger', 'The watch filter must use shadcn Select');
      const watchEntries = (await api.getState()).watchlist;
      openMenu(watchFilter);
      await waitFor(() => document.querySelector('[role=listbox]'), 'The watch type select did not open');
      const positiveOption = [...document.querySelectorAll('[role=option]')].find(element => element.textContent === '值得信赖');
      positiveOption.focus(); positiveOption.click();
      await waitFor(() => document.querySelectorAll('[data-slot=item]').length === watchEntries.filter(entry => entry.status === 'positive').length, 'The watch type select did not filter entries');
      assert(watchFilter.getAttribute('data-value') === 'positive', 'The watch type select label is stale');
      openMenu(watchFilter);
      await waitFor(() => document.querySelector('[role=listbox]'), 'The watch type select did not reopen');
      const allOption = [...document.querySelectorAll('[role=option]')].find(element => element.textContent === '全部标记');
      allOption.focus(); allOption.click();
      await waitFor(() => document.querySelectorAll('[data-slot=item]').length === watchEntries.length, 'Selecting all watch types did not restore entries');
      result.watchTypeSelect = true;

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

      location.hash = '/overview';
      await waitFor(() => document.querySelector('.player-table'), 'The workspace did not render for navigation scrolling');
      workspace.scrollTop = workspace.scrollHeight;
      assert(workspace.scrollTop > 0, 'Navigation scrolling requires a scrollable workspace');
      document.querySelector('.sidebar-brand').click();
      await waitFor(() => workspace.scrollTop === 0, 'Selecting the current page did not reset workspace scrolling');
      workspace.scrollTop = workspace.scrollHeight;
      location.hash = '/help';
      await waitFor(() => document.querySelector('[data-slot=accordion-trigger]') && workspace.scrollTop === 0, 'Changing the route did not reset workspace scrolling');
      result.workspaceNavigationResetsScroll = true;
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
