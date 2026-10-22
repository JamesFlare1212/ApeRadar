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
  if (previews.some(element => element.getBoundingClientRect().height < 24)) throw new Error('Appearance artwork did not render')
  const toolbarGroups = [...document.querySelectorAll('.roster-toolbar > div')].map(element => element.getBoundingClientRect())
  if (toolbarGroups.length === 2 && Math.min(toolbarGroups[0].right, toolbarGroups[1].right) - Math.max(toolbarGroups[0].left, toolbarGroups[1].left) > 1 && Math.min(toolbarGroups[0].bottom, toolbarGroups[1].bottom) - Math.max(toolbarGroups[0].top, toolbarGroups[1].top) > 1) throw new Error('Roster toolbar controls overlap')
  return { textCount, minimumTextContrast, minimumControlContrast, failures, overflow: document.documentElement.scrollWidth > innerWidth }
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
        const api = window.aperadar, original = (await api.getState()).settings;
        const routes = { overview: '.winrate-point', history: '[aria-label="搜索历史对局"]', watchlist: '[aria-label="搜索关注名单"]', help: '[data-slot=accordion-trigger]', 'settings/appearance': '#theme-heading', 'settings/general': '#rate-mode', 'settings/connection': '#api-type', 'settings/ratings': '#ape-threshold', 'settings/text': '#text-template', 'settings/about': '#update-heading' };
        const frame = () => new Promise(resolve => { const timer = setTimeout(resolve, 40); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); })); });
        const result = { views: 0, dialogViews: 0, textCount: 0, minimumTextContrast: Infinity, minimumControlContrast: Infinity };
        const wait = async condition => { for (let attempt = 0; attempt < 60; attempt++) { await frame(); if (condition()) return; } throw new Error('Dialog state did not settle'); };
        const check = context => {
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
              for (let attempt = 0; attempt < 60; attempt++) { await frame(); if (document.querySelector(selector)) break; }
              if (!document.querySelector(selector)) throw new Error('Page did not render: ' + route);
              const context = { palette, theme, route };
              check(context);
              result.views++;
              if (route === 'overview') {
                document.querySelector('.player-name-button').click();
                await wait(() => document.querySelector('[role=dialog]'));
                check({ ...context, dialog: 'player-account' }); result.dialogViews++;
                const shipTab = [...document.querySelectorAll('[role=tab]')].find(element => element.textContent === '单船统计');
                shipTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false }));
                await wait(() => shipTab.getAttribute('aria-selected') === 'true');
                check({ ...context, dialog: 'player-ship' }); result.dialogViews++;
                await closeDialog();
                [...document.querySelectorAll('button')].find(element => element.textContent === '生成文字摘要').click();
                await wait(() => document.getElementById('battle-summary'));
                check({ ...context, dialog: 'battle-summary' }); result.dialogViews++;
                await closeDialog();
              } else if (route === 'watchlist') {
                document.querySelector('[aria-label^="编辑 "]').click();
                await wait(() => document.getElementById('edit-watch-note'));
                check({ ...context, dialog: 'watch-note' }); result.dialogViews++;
                await closeDialog();
                document.querySelector('[aria-label^="移除 "]').click();
                await wait(() => document.querySelector('[role=alertdialog]'));
                check({ ...context, dialog: 'watch-removal' }); result.dialogViews++;
                document.querySelector('[data-slot=alert-dialog-cancel]').click();
                await wait(() => !document.querySelector('[role=alertdialog]'));
              } else if (route === 'settings/general') {
                [...document.querySelectorAll('button')].find(element => element.textContent === '恢复默认设置').click();
                await wait(() => document.querySelector('[role=alertdialog]'));
                check({ ...context, dialog: 'settings-reset' }); result.dialogViews++;
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
