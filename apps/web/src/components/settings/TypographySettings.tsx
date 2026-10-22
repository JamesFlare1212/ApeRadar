import { useState } from 'react'
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { DEFAULT_SETTINGS } from '@aperadar/shared/settings'
import type { Settings } from '@aperadar/shared/types'
import { Icon } from '../Icon.js'
import { Badge, ChoiceSelect, IconButton } from '../ui.js'
import { Card, CardContent, CardHeader } from '../ui/card.js'
import { Field, FieldDescription, FieldLabel } from '../ui/field.js'
import { Input } from '../ui/input.js'

const fonts = [
  { value: 'default', label: '默认字体' },
  { value: 'Inter Variable', label: 'Inter' },
  { value: 'Segoe UI', label: 'Segoe UI' },
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'MiSans', label: 'MiSans' },
  { value: 'Noto Sans SC', label: '思源黑体 · Noto Sans SC' },
  { value: 'Source Han Sans SC', label: '思源黑体 · Source Han Sans SC' },
  { value: 'PingFang SC', label: '苹方' },
  { value: 'custom', label: '自定义字体…' },
] as const
const sizes = Array.from({ length: 9 }, (_, index) => ({ value: String(index + 12), label: `${index + 12} px${index + 12 === DEFAULT_SETTINGS.fontSize ? '（默认）' : ''}` }))

export function TypographySettings({ draft, change }: { draft: Settings; change: (patch: Partial<Settings>, delay?: number) => void }) {
  const [custom, setCustom] = useState(false)
  const customFont = custom || (!!draft.fontFamily && !fonts.some(font => font.value === draft.fontFamily))
  const modified = draft.fontFamily !== DEFAULT_SETTINGS.fontFamily || draft.fontSize !== DEFAULT_SETTINGS.fontSize
  return <Card role="region" aria-labelledby="typography-heading">
    <CardHeader><h2 id="typography-heading" className="font-semibold">字体</h2></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h3 className="text-sm font-medium">界面字体</h3><IconButton label="重置字体与字号" disabled={!modified} onClick={() => { setCustom(false); change({ fontFamily: DEFAULT_SETTINGS.fontFamily, fontSize: DEFAULT_SETTINGS.fontSize }, 0) }}><Icon icon={faRotateLeft} size={14} /></IconButton></div>
          <FieldDescription id="font-description">应用于整个界面，更改即时生效并自动保存。</FieldDescription>
        </div>
        <div className="grid w-full min-w-0 gap-3 sm:w-auto sm:grid-cols-[minmax(0,15rem)_8rem]">
          <Field className="min-w-0"><FieldLabel htmlFor="interface-font">字体</FieldLabel><ChoiceSelect id="interface-font" descriptionId="font-description font-availability" value={customFont ? 'custom' : draft.fontFamily || 'default'} options={fonts} onValueChange={value => { setCustom(value === 'custom'); if (value !== 'custom') change({ fontFamily: value === 'default' ? '' : value }, 0) }} /></Field>
          <Field className="min-w-0"><FieldLabel htmlFor="interface-font-size">字号</FieldLabel><ChoiceSelect id="interface-font-size" value={String(draft.fontSize)} options={sizes} onValueChange={value => change({ fontSize: Number(value) }, 0)} /></Field>
        </div>
      </div>
      {customFont && <Field><FieldLabel htmlFor="custom-interface-font">自定义字体名称</FieldLabel><Input id="custom-interface-font" value={draft.fontFamily} placeholder="例如：MiSans" maxLength={100} aria-describedby="font-availability" onChange={event => change({ fontFamily: event.target.value })} /></Field>}
      <FieldDescription id="font-availability">Inter 已内置，其他字体需已安装在本机。字体或字形不可用时自动使用默认字体。</FieldDescription>
      <div role="group" aria-label="字体预览" className="space-y-2 rounded-lg border bg-background p-4 text-base leading-relaxed wrap-anywhere">
        <p>掌握战局，从每一位舰长开始。<Badge tone="ally" className="text-[1em]">我方舰队</Badge> 与 <Badge tone="enemy" className="text-[1em]">敌方舰队</Badge> 已准备就绪。</p>
        <p className="text-muted-foreground">ApeRadar · World of Warships · 胜率 <span className="numeric">58.76%</span> · 场次 <span className="numeric">1,234</span></p>
      </div>
    </CardContent>
  </Card>
}
