import { faCheck, faDesktop, faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import type { ColorPalette, Settings } from '@aperadar/shared/types'
import { Icon } from './Icon.js'

const modes = [{ key: 'system', label: '跟随系统', icon: faDesktop }, { key: 'light', label: '浅色', icon: faSun }, { key: 'dark', label: '深色', icon: faMoon }] as const
const palettes: { key: ColorPalette; label: string }[] = [{ key: 'graphite', label: '石墨' }, { key: 'cyan', label: '青空' }, { key: 'orange', label: '暖橙' }, { key: 'violet', label: '紫夜' }, { key: 'forest', label: '森林' }, { key: 'ocean', label: '深海' }]

export function AppearanceSettings({ draft, change }: { draft: Settings; change: (patch: Partial<Settings>, delay?: number) => void }) {
  return <>
    <section className="settings-section" aria-labelledby="theme-heading">
      <h2 id="theme-heading" className="settings-section-title">主题</h2>
      <div className="appearance-modes" role="group" aria-labelledby="theme-heading">
        {modes.map(({ key, label, icon }) => <button type="button" key={key} className="appearance-mode" aria-pressed={draft.theme === key} onClick={() => change({ theme: key }, 0)}>
          <span className={`mode-preview mode-preview-${key}`} aria-hidden="true"><span className="mode-preview-sidebar"><i /><i /><i /></span><span className="mode-preview-main"><i /><i /><span /></span></span>
          <span className="appearance-mode-label"><Icon icon={icon} size={16} />{label}{draft.theme === key && <Icon icon={faCheck} size={13} />}</span>
        </button>)}
      </div>
    </section>
    <section className="settings-section" aria-labelledby="palette-heading">
      <h2 id="palette-heading" className="settings-section-title">配色方案</h2>
      <p className="settings-description">点击卡片选择整组配色，或单独选择浅色、深色配色。当前主题模式保持不变。</p>
      <div className="color-schemes" role="group" aria-labelledby="palette-heading">
        {palettes.map(({ key, label }) => <div key={key} className="color-scheme" data-palette={key} role="group" aria-label={label}>
          <button type="button" className="palette-pair-select" aria-label={`${label} · 选择整组配色`} aria-pressed={draft.lightPalette === key && draft.darkPalette === key} onClick={() => change({ lightPalette: key, darkPalette: key }, 0)} />
          <div className="palette-preview">{(['light', 'dark'] as const).map(mode => {
            const selected = draft[mode === 'light' ? 'lightPalette' : 'darkPalette'] === key
            return <button type="button" key={mode} className="palette-choice" data-mode={mode} aria-label={`${label} · ${mode === 'light' ? '浅色' : '深色'}`} aria-pressed={selected} onClick={() => change({ [mode === 'light' ? 'lightPalette' : 'darkPalette']: key }, 0)}><span className="palette-orb" aria-hidden="true" /><span className="palette-mode-icon" aria-hidden="true"><Icon icon={selected ? faCheck : mode === 'light' ? faSun : faMoon} size={11} /></span></button>
          })}</div>
          <span className="palette-label">{label}</span>
        </div>)}
      </div>
    </section>
  </>
}
