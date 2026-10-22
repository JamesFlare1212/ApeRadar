import type { BrowserWindow } from 'electron'

// Run inside Chromium so color-mix, alpha, SVG fills, and inherited colors are resolved.
function inspectAppearance() {
  const context = document.createElement('canvas').getContext('2d')!
  function color(value: string) {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    return [...context.getImageData(0, 0, 1, 1).data].map((value, index) => index === 3 ? value / 255 : value)
  }
  const blend = (foreground: number[], background: number[]) => foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3])).concat(1)
  const luminance = (value: number[]) => value.slice(0, 3).map(channel => { channel /= 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4 }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
  const contrast = (foreground: number[], background: number[]) => {
    const a = luminance(blend(foreground, background)), b = luminance(background)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  }
  function background(element: Element) {
    const ancestors: Element[] = []
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current)
    return ancestors.reduce((value, ancestor) => blend(color(getComputedStyle(ancestor).backgroundColor), value), [255, 255, 255, 1])
  }
  const failures: { text: string; ratio: number }[] = []
  let textCount = 0
  let minimumTextContrast = Infinity
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue
    const element = node.parentElement!
    const style = getComputedStyle(element), rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height || element.closest('script,style,.sr-only,[aria-hidden="true"],[hidden],button:disabled,[data-state="closed"]') || style.visibility === 'hidden') continue
    const range = document.createRange()
    range.selectNode(node)
    const textRect = range.getBoundingClientRect()
    if (textRect.width <= 1 || textRect.height <= 1) continue
    const ratio = contrast(color(element instanceof SVGElement ? style.fill : style.color), background(element))
    const large = parseFloat(style.fontSize) >= (parseInt(style.fontWeight) >= 700 ? 18.66 : 24)
    textCount++
    minimumTextContrast = Math.min(minimumTextContrast, ratio)
    if (ratio < (large ? 3 : 4.5) - .02) failures.push({ text: node.textContent.trim().slice(0, 70), ratio })
  }
  const probe = document.createElement('span')
  document.body.append(probe)
  const token = (name: string) => { probe.style.color = `var(--${name})`; return color(getComputedStyle(probe).color) }
  let minimumControlContrast = Infinity
  for (const surface of ['surface', 'background', 'surface-muted']) {
    const ratio = contrast(token('control-border'), token(surface))
    minimumControlContrast = Math.min(minimumControlContrast, ratio)
    if (ratio < 3) failures.push({ text: `Control boundary on ${surface}`, ratio })
  }
  for (const [foreground, surface] of [['on-accent', 'accent'], ['on-danger', 'danger']]) {
    const ratio = contrast(token(foreground), token(surface))
    if (ratio < 4.5) failures.push({ text: `${foreground} on ${surface}`, ratio })
  }
  probe.remove()
  const previews = [...document.querySelectorAll('.mode-preview, .palette-sample')]
  const undersizedPreviews = previews.flatMap(element => {
    const rect = element.getBoundingClientRect()
    return rect.height < 24 ? [{ className: element.className, width: rect.width, height: rect.height }] : []
  })
  if (undersizedPreviews.length) throw new Error('Appearance artwork did not render: ' + JSON.stringify({ width: innerWidth, fontSize: getComputedStyle(document.body).fontSize, previews: undersizedPreviews }))
  const toolbarGroups = [...document.querySelectorAll('.roster-toolbar > div')].map(element => element.getBoundingClientRect())
  if (toolbarGroups.length === 2 && Math.min(toolbarGroups[0].right, toolbarGroups[1].right) - Math.max(toolbarGroups[0].left, toolbarGroups[1].left) > 1 && Math.min(toolbarGroups[0].bottom, toolbarGroups[1].bottom) - Math.max(toolbarGroups[0].top, toolbarGroups[1].top) > 1) throw new Error('Roster toolbar controls overlap')
  const overflow = document.documentElement.scrollWidth > innerWidth
  const overflowingElements = overflow ? [...document.querySelectorAll('#main-content *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map(element => ({ tag: element.tagName, className: element.getAttribute('class'), right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })) : []
  return { textCount, minimumTextContrast, minimumControlContrast, failures, overflow, scrollWidth: document.documentElement.scrollWidth, overflowingElements }
}

// ResizeObserver updates the chart after the viewport and its container have resized.
async function waitForAppearanceLayout(expectedWidth: number, selector?: string) {
  await document.fonts.ready
  let stableFrames = 0
  const chartSizes = () => [...document.querySelectorAll('[data-slot=chart]')].map(container => ({ containerWidth: container.clientWidth, plotWidth: container.querySelector('.recharts-wrapper')?.getBoundingClientRect().width }))
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise<void>(resolve => { const timer = setTimeout(resolve, 40); requestAnimationFrame(() => { clearTimeout(timer); resolve() }) })
    const ready = innerWidth === expectedWidth && (!selector || !!document.querySelector(selector)) && chartSizes().every(size => size.plotWidth === undefined || Math.abs(size.plotWidth - size.containerWidth) < 2)
    stableFrames = ready ? stableFrames + 1 : 0
    if (stableFrames >= 2) return
  }
  throw new Error(JSON.stringify({ message: 'Appearance layout did not settle', expectedWidth, width: innerWidth, selector, charts: chartSizes() }))
}

export async function validateAppearance(window: BrowserWindow) {
  const bounds = window.getContentBounds(), minimumSize = window.getMinimumSize()
  window.setMinimumSize(320, 560)
  const results: { views: number; dialogViews: number; textCount: number; minimumTextContrast: number; minimumControlContrast: number }[] = []
  try {
    for (const width of [1440, 390]) {
      window.setContentSize(width, 1000)
      results.push(await window.webContents.executeJavaScript(`(async () => {
        const inspect = ${inspectAppearance.toString()};
        const waitForLayout = ${waitForAppearanceLayout.toString()};
        const api = window.aperadar, original = (await api.getState()).settings;
        const routes = { overview: '.winrate-point', history: '[aria-label="搜索历史对局"]', watchlist: '[aria-label="搜索关注名单"]', help: '[data-slot=accordion-trigger]', 'settings/appearance': '#theme-heading', 'settings/general': '#rate-mode', 'settings/connection': '#api-type', 'settings/ratings': '#ape-threshold', 'settings/text': '#text-template', 'settings/about': '#update-heading' };
        const frame = () => new Promise(resolve => { const timer = setTimeout(resolve, 40); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); })); });
        const result = { views: 0, dialogViews: 0, textCount: 0, minimumTextContrast: Infinity, minimumControlContrast: Infinity };
        const wait = async condition => { for (let attempt = 0; attempt < 60; attempt++) { await frame(); if (condition()) return; } throw new Error('Dialog state did not settle'); };
        const check = async (context, selector) => {
          await waitForLayout(${width}, selector);
          const state = inspect();
          if (state.overflow || state.failures.length) throw new Error(JSON.stringify({ width: innerWidth, ...context, ...state }));
          result.textCount += state.textCount;
          result.minimumTextContrast = Math.min(result.minimumTextContrast, state.minimumTextContrast);
          result.minimumControlContrast = Math.min(result.minimumControlContrast, state.minimumControlContrast);
        };
        const closeDialog = async () => { document.querySelector('[aria-label="关闭窗口"]').click(); await wait(() => !document.querySelector('[role=dialog]')); };
        try {
          for (const palette of ['graphite', 'cyan', 'orange', 'violet', 'forest', 'ocean']) for (const theme of ['light', 'dark']) {
            location.hash = '/overview';
            await api.saveSettings({ ...original, theme, lightPalette: palette, darkPalette: palette });
            for (let attempt = 0; attempt < 60 && (document.documentElement.dataset.palette !== palette || document.documentElement.classList.contains('dark') !== (theme === 'dark')); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
            if (document.documentElement.dataset.palette !== palette || document.documentElement.classList.contains('dark') !== (theme === 'dark')) throw new Error('Appearance did not settle: ' + theme + '/' + palette);
            for (const [route, selector] of Object.entries(routes)) {
              location.hash = '/' + route;
              const context = { palette, theme, route };
              await check(context, selector);
              result.views++;
              if (route === 'overview') {
                document.querySelector('.player-name-button').click();
                await wait(() => document.querySelector('[role=dialog]'));
                await check({ ...context, dialog: 'player-account' }); result.dialogViews++;
                const shipTab = [...document.querySelectorAll('[role=tab]')].find(element => element.textContent === '单船统计');
                shipTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false }));
                await wait(() => shipTab.getAttribute('aria-selected') === 'true');
                await check({ ...context, dialog: 'player-ship' }); result.dialogViews++;
                await closeDialog();
                [...document.querySelectorAll('button')].find(element => element.textContent === '生成文字摘要').click();
                await wait(() => document.getElementById('battle-summary'));
                await check({ ...context, dialog: 'battle-summary' }); result.dialogViews++;
                await closeDialog();
              } else if (route === 'watchlist') {
                document.querySelector('[aria-label^="编辑 "]').click();
                await wait(() => document.getElementById('edit-watch-note'));
                await check({ ...context, dialog: 'watch-note' }); result.dialogViews++;
                await closeDialog();
                document.querySelector('[aria-label^="移除 "]').click();
                await wait(() => document.querySelector('[role=alertdialog]'));
                await check({ ...context, dialog: 'watch-removal' }); result.dialogViews++;
                document.querySelector('[data-slot=alert-dialog-cancel]').click();
                await wait(() => !document.querySelector('[role=alertdialog]'));
              } else if (route === 'settings/general') {
                [...document.querySelectorAll('button')].find(element => element.textContent === '恢复默认设置').click();
                await wait(() => document.querySelector('[role=alertdialog]'));
                await check({ ...context, dialog: 'settings-reset' }); result.dialogViews++;
                document.querySelector('[data-slot=alert-dialog-cancel]').click();
                await wait(() => !document.querySelector('[role=alertdialog]'));
              }
            }
          }
        } finally { await api.saveSettings(original); location.hash = '/overview'; await frame(); }
        return result;
      })()`))
    }
  } finally {
    window.setContentBounds(bounds)
    window.setMinimumSize(minimumSize[0], minimumSize[1])
  }
  return { views: results.reduce((sum, result) => sum + result.views, 0), dialogViews: results.reduce((sum, result) => sum + result.dialogViews, 0), textChecks: results.reduce((sum, result) => sum + result.textCount, 0), minimumTextContrast: Math.min(...results.map(result => result.minimumTextContrast)), minimumControlContrast: Math.min(...results.map(result => result.minimumControlContrast)), widths: [1440, 390], palettes: 6, themes: 2 }
}

export async function validateTypography(window: BrowserWindow) {
  const bounds = window.getContentBounds(), minimumSize = window.getMinimumSize()
  const results: { views: number; minimumSize: number; maximumSize: number }[] = []
  window.setMinimumSize(320, 560)
  try {
    for (const width of [1440, 390]) {
      window.setContentSize(width, 1000)
      results.push(await window.webContents.executeJavaScript(`(async () => {
        const inspect = ${inspectAppearance.toString()};
        const waitForLayout = ${waitForAppearanceLayout.toString()};
        const api = window.aperadar, original = (await api.getState()).settings;
        const frame = () => new Promise(resolve => { const timer = setTimeout(resolve, 40); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); })); });
        let views = 0;
        try {
          for (const fontSize of [12, 20]) for (const theme of ['light', 'dark']) {
            location.hash = '/overview';
            await api.saveSettings({ ...original, theme, fontFamily: 'Segoe UI', fontSize });
            for (let attempt = 0; attempt < 60; attempt++) {
              await frame();
              if (Math.abs(parseFloat(getComputedStyle(document.body).fontSize) - fontSize) < .1) break;
            }
            for (const route of ['overview', 'settings/appearance']) {
              location.hash = '/' + route;
              const selector = route === 'overview' ? '.rate' : '#interface-font-size';
              await waitForLayout(${width}, selector);
              const state = inspect();
              if (state.overflow || state.failures.length) {
                const overflowing = [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map(element => ({ tag: element.tagName, className: element.getAttribute('class'), text: element.textContent.slice(0, 70), right: element.getBoundingClientRect().right }));
                throw new Error(JSON.stringify({ width: innerWidth, fontSize, theme, route, overflowing, ...state }));
              }
              if (Math.abs(parseFloat(getComputedStyle(document.body).fontSize) - fontSize) > .1) throw new Error('Typography did not settle');
              for (const element of document.querySelectorAll('.rate, .damage-column.numeric')) {
                if (!element.getBoundingClientRect().width) continue;
                const range = document.createRange(); range.selectNodeContents(element);
                const rect = range.getBoundingClientRect(), cell = element.closest('td').getBoundingClientRect();
                if (rect.left < cell.left - 1 || rect.right > cell.right + 1) throw new Error('Roster statistics overflow at font size ' + fontSize + ': ' + element.textContent);
              }
              views++;
            }
          }
        } finally { await api.saveSettings(original); location.hash = '/overview'; await frame(); }
        return { views, minimumSize: 12, maximumSize: 20 };
      })()`))
    }
  } finally {
    window.setContentBounds(bounds)
    window.setMinimumSize(minimumSize[0], minimumSize[1])
  }
  return { views: results.reduce((sum, result) => sum + result.views, 0), sizes: [12, 20], widths: [1440, 390], themes: ['light', 'dark'] }
}
