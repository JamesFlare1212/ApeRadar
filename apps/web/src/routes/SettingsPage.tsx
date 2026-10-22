import { useState } from 'react'
import { faRotateLeft, faShieldHalved, faSliders, faPlug, faFont, faDatabase, faCircleCheck, faCircleExclamation } from '@fortawesome/free-solid-svg-icons'
import type { AppState, Settings } from '@aperadar/shared/types'
import { REGION_LABELS, SUPPORTED_REGIONS } from '@aperadar/shared/types'
import { DEFAULT_SETTINGS, settingsSchema } from '@aperadar/shared/settings'
import { useAppearance } from '@/lib/appearance.js'
import { useSettingsAutosave } from '@/hooks/useSettingsAutosave.js'
import type { SettingsSection } from '@/lib/settingsNavigation.js'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings.js'
import { GameClientSettings } from '@/components/settings/GameClientSettings.js'
import { HealthPanel } from '@/components/settings/HealthPanel.js'
import { NumberField, SettingsCard, SettingsToggle } from '@/components/settings/SettingsFields.js'
import { UpdatePanel } from '@/components/updates/UpdatePanel.js'
import { Icon } from '@/components/Icon.js'
import { Badge, Button, ChoiceSelect, ConfirmationDialog, Notice } from '@/components/ui.js'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.js'
import { Spinner } from '@/components/ui/spinner.js'
import { Textarea } from '@/components/ui/textarea.js'
import appPackage from '../../package.json'

export function SettingsPage({ state, section, onSave, notify }: { state: AppState; section: SettingsSection; onSave: (settings: Settings) => Promise<boolean>; notify: (text: string, error?: boolean) => void }) {
  const [resetOpen, setResetOpen] = useState(false)
  const { draft, status, error, change, flush } = useSettingsAutosave(state.settings, onSave)
  useAppearance(draft, true)
  const validation = settingsSchema.safeParse(draft)
  function fieldError(path: string) { return status === 'error' && !validation.success ? validation.error.issues.find(issue => issue.path.join('.') === path)?.message : undefined }
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => change({ [key]: value })
  const weight = <K extends keyof Settings['weights']>(key: K, value: number) => change({ weights: { ...draft.weights, [key]: value } })
  return <div className="settings-content">
    {error ? <Notice role="alert" variant="destructive" title="设置未保存" icon={<Icon icon={faCircleExclamation} size={16} />}><p>{error}</p><Button size="sm" onClick={() => { void flush() }}>重试保存</Button></Notice> : <Badge role="status" aria-live="polite" tone={status === 'saved' ? 'success' : 'brand'} className="self-end gap-2 px-3 py-1.5">{status === 'saving' ? <Spinner aria-hidden="true" /> : <Icon icon={faCircleCheck} size={14} />}{status === 'saved' ? '已自动保存' : status === 'saving' ? '正在保存…' : '等待保存…'}</Badge>}
    {section === 'appearance' && <AppearanceSettings draft={draft} change={change} />}
    {section === 'general' && <>
      <SettingsCard icon={faSliders} title="信息与隐私" description="调整默认显示方式，保留自己需要的信息。">
        <Field><FieldLabel htmlFor="rate-mode">默认胜率口径</FieldLabel><ChoiceSelect id="rate-mode" value={draft.winrate} onValueChange={value => update('winrate', value)} options={[{ value: 'account', label: '账号胜率' }, { value: 'weighted', label: '加权胜率' }]} /></Field>
        <SettingsToggle checked={draft.showNames} onChange={value => update('showNames', value)} label="显示舰长名称" description="关闭后隐藏名称，也会在文本和导出文件中省略昵称。" />
      </SettingsCard>
      <div className="settings-reset"><p className="text-sm text-muted-foreground">更改即时生效，并自动保存在本机。</p><Button onClick={() => setResetOpen(true)}><Icon icon={faRotateLeft} size={14} />恢复默认设置</Button></div>
    </>}
    {section === 'connection' && <>
      <SettingsCard icon={faPlug} title="游戏与连接" description="连接本机客户端，自动发现新对局。">
        <GameClientSettings gamePath={draft.gamePath} change={change} />
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="region">主区服</FieldLabel><ChoiceSelect id="region" descriptionId="region-description" value={draft.region} onValueChange={value => update('region', value)} options={[{ value: 'AUTO', label: '自动识别' }, ...SUPPORTED_REGIONS.map(value => ({ value, label: `${REGION_LABELS[value]} · ${value}` }))]} /><FieldDescription id="region-description">{draft.region === 'AUTO' ? '根据游戏偏好设置与最近的启动日志识别；无法确定时暂停查询。' : `已手动选择${REGION_LABELS[draft.region]}，查询将使用这个区服。`}</FieldDescription></Field>
          <Field><FieldLabel htmlFor="api-type">战绩来源</FieldLabel><ChoiceSelect id="api-type" value={draft.api} onValueChange={value => update('api', value)} options={[{ value: 'VORTEX', label: 'Vortex' }, { value: 'WG_PUBLIC', label: 'Wargaming 公共 API' }]} /></Field>
        </FieldGroup>
        <SettingsToggle checked={draft.secondaryEnabled} onChange={value => update('secondaryEnabled', value)} label="混合区服对局" description="我方查询主区服，敌方查询下方指定的区服。" />
        {draft.secondaryEnabled && <Field><FieldLabel htmlFor="secondary-region">敌方区服</FieldLabel><ChoiceSelect id="secondary-region" value={draft.secondaryRegion} onValueChange={value => update('secondaryRegion', value)} options={SUPPORTED_REGIONS.map(value => ({ value, label: REGION_LABELS[value] }))} /></Field>}
        <SettingsToggle checked={draft.autoQuery} onChange={value => update('autoQuery', value)} label="导入后自动查询" description="新阵容出现后取得战绩，查询结果逐位显示。" />
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <NumberField id="cache-minutes" label="缓存时间（分钟）" description="避免短时间内反复请求同一账号与舰船。" min={1} max={1440} value={draft.cacheMinutes} error={fieldError('cacheMinutes')} onValueChange={value => update('cacheMinutes', value)} />
          <Field><FieldLabel htmlFor="retry-attempts">请求失败重试次数</FieldLabel><ChoiceSelect id="retry-attempts" value={String(draft.retryAttempts)} onValueChange={value => update('retryAttempts', Number(value))} options={[0, 1, 2, 3].map(value => ({ value: String(value), label: `${value} 次` }))} /></Field>
        </FieldGroup>
      </SettingsCard>
      <HealthPanel state={state} notify={notify} />
    </>}
    {section === 'ratings' && <SettingsCard icon={faSliders} title="评分与胜率" description="调整分级阈值与加权参数。">
      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <NumberField id="ape-threshold" label="海猴胜率上限（≤ %）" step="0.1" min={0} max={100} value={draft.apeThreshold} error={fieldError('apeThreshold')} onValueChange={value => update('apeThreshold', value)} />
        <NumberField id="elite-threshold" label="精英胜率下限（> %）" step="0.1" min={0} max={100} value={draft.unicumThreshold} error={fieldError('unicumThreshold')} onValueChange={value => update('unicumThreshold', value)} />
        <NumberField id="ape-min" label="海猴最少账号场次" min={0} max={1000000} value={draft.minApeBattles} error={fieldError('minApeBattles')} onValueChange={value => update('minApeBattles', value)} />
        <NumberField id="elite-min" label="精英最少账号场次" min={0} max={1000000} value={draft.minUnicumBattles} error={fieldError('minUnicumBattles')} onValueChange={value => update('minUnicumBattles', value)} />
      </FieldGroup>
      <h3 className="text-sm font-semibold">加权胜率参数</h3>
      <FieldGroup className="grid gap-5 sm:grid-cols-3">{([{ key: 'solo', label: '单排乘数' }, { key: 'div2', label: '双排乘数' }, { key: 'div3', label: '三排乘数' }] as const).map(item => <NumberField key={item.key} id={`weight-${item.key}`} label={item.label} min={0} max={10000} step="0.1" value={draft.weights[item.key]} error={fieldError(`weights.${item.key}`)} onValueChange={value => weight(item.key, value)} />)}</FieldGroup>
      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <NumberField id="ship-max" label="本舰最大占比（%）" min={0} max={100} step="1" value={draft.weights.shipMax} error={fieldError('weights.shipMax')} onValueChange={value => weight('shipMax', value)} />
        <NumberField id="ship-battles" label="达到最大占比的本舰场次" min={0} max={100000} value={draft.weights.shipBattles} error={fieldError('weights.shipBattles')} onValueChange={value => weight('shipBattles', value)} />
      </FieldGroup>
      <Notice icon={<Icon icon={faShieldHalved} size={18} />}>账号基线按「各模式场次 × 乘数」归一化；本舰占比随场次线性增加，至上限封顶。零本舰场次及无有效模式权重时回退账号胜率。</Notice>
    </SettingsCard>}
    {section === 'text' && <SettingsCard icon={faFont} title="文本摘要" description="按当前胜率口径生成，可编辑后手动复制。">
      <Field data-invalid={!!fieldError('textTemplate')}><FieldLabel htmlFor="text-template">摘要模板</FieldLabel><Textarea id="text-template" rows={4} maxLength={4000} value={draft.textTemplate} aria-invalid={!!fieldError('textTemplate')} aria-describedby={fieldError('textTemplate') ? 'text-template-description text-template-error' : 'text-template-description'} onChange={event => update('textTemplate', event.target.value)} /><FieldDescription id="text-template-description">支持 {'{AllyUnicumList}'}、{'{AllyApeList}'}、{'{EnemyUnicumList}'}、{'{EnemyApeList}'}、双方 HiddenList 与 AvgAccountWinrate / AvgWeightedWinrate。</FieldDescription><FieldError id="text-template-error">{fieldError('textTemplate')}</FieldError></Field>
      <SettingsToggle checked={draft.excludeSelf} onChange={value => update('excludeSelf', value)} label="摘要名单中排除自己" description="只影响文字名单，队伍统计仍保留自己。" />
    </SettingsCard>}
    {section === 'about' && <>
      <UpdatePanel notify={notify} installBlocked={state.query.status === 'loading'} />
      <SettingsCard icon={faDatabase} title="本地资料" description={`应用版本 ${appPackage.version} · 船舶资料 ${state.shipVersion}`}><p className="data-path">{state.dataLocation}</p><p className="text-sm text-muted-foreground">数据库包含设置、对局历史、关注名单和有时效的战绩缓存。关闭应用后再复制此文件进行备份。</p></SettingsCard>
    </>}
    <ConfirmationDialog open={resetOpen} onOpenChange={setResetOpen} title="恢复默认设置？" description="将主题、游戏目录、评分参数和摘要模板恢复到初始值。" actionLabel="恢复默认设置" onConfirm={() => { change(structuredClone(DEFAULT_SETTINGS), 0) }} />
  </div>
}
