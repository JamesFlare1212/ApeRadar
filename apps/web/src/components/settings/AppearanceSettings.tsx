import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { ColorPalette, Settings } from '@aperadar/shared/types'
import { Icon } from '../Icon.js'
import { Button } from '../ui.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.js'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '../ui/field.js'
import { cn } from '../../lib/utils.js'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group.js'
import { TypographySettings } from './TypographySettings.js'

const modes = [{ key: 'system', label: '跟随系统', icon: Monitor }, { key: 'light', label: '浅色', icon: Sun }, { key: 'dark', label: '深色', icon: Moon }] as const
const palettes: { key: ColorPalette; label: string }[] = [{ key: 'graphite', label: '石墨' }, { key: 'cyan', label: '青空' }, { key: 'orange', label: '暖橙' }, { key: 'violet', label: '紫夜' }, { key: 'forest', label: '森林' }, { key: 'ocean', label: '深海' }]

export function AppearanceSettings({ draft, change }: { draft: Settings; change: (patch: Partial<Settings>, delay?: number) => void }) {
  return <>
    <Card role="region" aria-labelledby="theme-heading">
      <CardHeader><CardTitle><h2 id="theme-heading">主题</h2></CardTitle></CardHeader>
      <CardContent><FieldSet><FieldLegend className="sr-only">主题模式</FieldLegend><RadioGroup className="grid grid-cols-3" aria-labelledby="theme-heading" value={draft.theme} onValueChange={value => change({ theme: value as Settings['theme'] }, 0)}>
        {modes.map(({ key, label, icon }) => <Field key={key}><FieldLabel htmlFor={`theme-${key}`} className="block h-full w-full min-w-0 cursor-pointer rounded-lg border p-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
          <span className={cn('mode-preview', `mode-preview-${key}`)} aria-hidden="true"><span className="mode-preview-sidebar"><i /><i /><i /></span><span className="mode-preview-main"><i /><i /><span /></span></span>
          <span className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs"><RadioGroupItem id={`theme-${key}`} value={key} aria-label={label} /><Icon icon={icon} />{label}</span>
        </FieldLabel></Field>)}
      </RadioGroup></FieldSet></CardContent>
    </Card>
    <Card role="region" aria-labelledby="palette-heading">
      <CardHeader><CardTitle><h2 id="palette-heading">配色方案</h2></CardTitle><CardDescription>点击卡片选择整组配色，或单独选择浅色、深色配色。当前主题模式保持不变。</CardDescription></CardHeader>
      <CardContent>
        <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="group" aria-label="配色选择">
          {palettes.map(({ key, label }) => {
            const pairSelected = draft.lightPalette === key && draft.darkPalette === key
            return <Card key={key} role="group" aria-label={label} data-palette={key} className={cn('relative min-w-0 gap-3 p-2 sm:p-3', pairSelected && 'border-primary bg-primary/5')}>
              <Button id={`palette-${key}`} variant="ghost" className="absolute inset-0 z-0 h-full w-full rounded-[inherit] p-0" aria-label={`${label} · 选择整组配色`} aria-pressed={pairSelected} onClick={() => change({ lightPalette: key, darkPalette: key }, 0)} />
              <div className="pointer-events-none relative z-10 flex justify-center gap-3 py-2">
                {(['light', 'dark'] as const).map(mode => {
                  const field = mode === 'light' ? 'lightPalette' : 'darkPalette'
                  const selected = draft[field] === key
                  return <Button key={mode} variant="ghost" className="palette-choice pointer-events-auto relative aspect-square h-auto w-16 min-w-0 shrink rounded-full border-2 border-transparent p-1 aria-pressed:border-primary" data-mode={mode} aria-label={`${label} · ${mode === 'light' ? '浅色' : '深色'}`} aria-pressed={selected} onClick={() => change({ [field]: key }, 0)}>
                    <span className={cn('palette-sample', `palette-sample-${mode}`)} aria-hidden="true" />
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-card bg-muted text-muted-foreground" aria-hidden="true"><Icon icon={selected ? Check : mode === 'light' ? Sun : Moon} /></span>
                  </Button>
                })}
              </div>
              <span className="pointer-events-none relative z-10 text-sm font-medium">{label}</span>
            </Card>
          })}
        </FieldGroup>
      </CardContent>
    </Card>
    <TypographySettings draft={draft} change={change} />
  </>
}
