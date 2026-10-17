import { useId, useState } from 'react'
import { faRotateLeft, faShieldHalved, faSliders, faPlug, faFont, faDatabase, faCircleCheck, faCircleNotch, faCircleExclamation } from '@fortawesome/free-solid-svg-icons'
import { Icon } from '../components/Icon.js'
import type { AppState, Settings } from '@aperadar/shared/types'
import { REGION_LABELS, SUPPORTED_REGIONS } from '@aperadar/shared/types'
import { DEFAULT_SETTINGS } from '@aperadar/shared/settings'
import { useAppearance } from '../lib/appearance.js'
import { useSettingsAutosave } from '../lib/useSettingsAutosave.js'
import { AppearanceSettings } from '../components/AppearanceSettings.js'
import { HealthPanel } from '../components/HealthPanel.js'
import { UpdatePanel } from '../components/UpdatePanel.js'
import { GameClientSettings } from '../components/GameClientSettings.js'
import appPackage from '../../../../package.json'
import { Button, Badge, Modal } from '../components/ui.js'

import type { SettingsSection } from '../lib/settingsNavigation.js'

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  const id = useId()
  return <label className="setting-toggle"><span><strong id={`${id}-label`}>{label}</strong>{description && <small id={`${id}-hint`}>{description}</small>}</span><input type="checkbox" role="switch" aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-hint` : undefined} checked={checked} onChange={e => onChange(e.target.checked)} /><span className="switch-track" aria-hidden="true"><i /></span></label>
}
export function SettingsPage({ state, section, onSave, notify }: { state: AppState; section: SettingsSection; onSave: (settings: Settings) => Promise<boolean>; notify: (text: string, error?: boolean) => void }) {
  const [resetOpen, setResetOpen] = useState(false)
  const { draft, status, error, change, flush } = useSettingsAutosave(state.settings, onSave)
  useAppearance(draft, true)
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => change({ [key]: value })
  const weight = <K extends keyof Settings['weights']>(key: K, value: number) => change({ weights: { ...draft.weights, [key]: value } })
  return <div className="settings-content">
    <div className={`settings-page-top settings-status ${error ? 'text-danger' : 'muted'}`} role="status" aria-live="polite"><Icon icon={status === 'error' ? faCircleExclamation : status === 'saving' ? faCircleNotch : faCircleCheck} size={14} spin={status === 'saving'} /><span>{error || (status === 'saved' ? '已自动保存' : status === 'saving' ? '正在保存…' : '等待保存…')}</span>{status === 'error' && <Button onClick={() => { void flush() }}>重试保存</Button>}</div>
    {section === 'appearance' && <AppearanceSettings draft={draft} change={change} />}
    {section === 'general' && <section className="panel settings-panel"><div className="settings-section-heading"><span><Icon icon={faSliders} size={22} /></span><div><h2>信息与隐私</h2><p>调整默认显示方式，保留自己需要的信息。</p></div></div><div className="form-field"><label htmlFor="rate-mode">默认胜率口径</label><select id="rate-mode" className="input" value={draft.winrate} onChange={e => update('winrate', e.target.value as Settings['winrate'])}><option value="account">账号胜率</option><option value="weighted">加权胜率</option></select></div><Toggle checked={draft.showNames} onChange={v => update('showNames', v)} label="显示舰长名称" description="关闭后隐藏名称，也会在文本和导出文件中省略昵称。" /><div className="privacy-callout"><Icon icon={faShieldHalved} size={21} /><div><strong>你的记录，留在本机</strong><p>对局和关注名单保存在本地。战绩查询仅访问你选择的数据源；应用不向第三方推送整场阵容。</p></div></div></section>}
    {section === 'connection' && <>
    <section className="panel settings-panel"><div className="settings-section-heading"><span><Icon icon={faPlug} size={22} /></span><div><h2>游戏与连接</h2><p>连接本机客户端，自动发现新对局。</p></div></div><GameClientSettings gamePath={draft.gamePath} change={change} />
      <div className="form-grid"><div className="form-field"><label htmlFor="region">主区服</label><select id="region" className="input" value={draft.region} onChange={e => update('region', e.target.value as Settings['region'])}><option value="AUTO">自动识别</option>{SUPPORTED_REGIONS.map(key => <option key={key} value={key}>{REGION_LABELS[key]} · {key}</option>)}</select><p>{draft.region === 'AUTO' ? '根据游戏偏好设置与最近的启动日志识别；无法确定时暂停查询。' : `已手动选择${REGION_LABELS[draft.region]}，查询将使用这个区服。`}</p></div><div className="form-field"><label htmlFor="api-type">战绩来源</label><select id="api-type" className="input" value={draft.api} onChange={e => update('api', e.target.value as Settings['api'])}><option value="VORTEX">Vortex</option><option value="WG_PUBLIC">Wargaming 公共 API</option></select></div></div>
      {draft.api !== 'VORTEX' && <div className="form-field"><label htmlFor="wg-key">WG 应用标识</label><input id="wg-key" className="input" value={draft.wgApplicationId} maxLength={64} readOnly={state.apiConfiguration?.applicationIdManaged} aria-describedby="wg-key-help" onChange={e => update('wgApplicationId', e.target.value)} /><p id="wg-key-help" style={{ overflowWrap: 'anywhere' }}>{state.apiConfiguration?.applicationIdManaged ? state.apiConfiguration.applicationIdSource === 'environment' ? '由 WG_APPLICATION_ID 环境变量管理，修改后重新启动应用。' : `由配置文件管理，修改后重新启动应用。${state.apiConfiguration.filePath ?? ''}` : '这是应用标识，不是玩家登录口令。俄服自动使用 Vortex。'}</p></div>}
      <Toggle checked={draft.secondaryEnabled} onChange={v => update('secondaryEnabled', v)} label="混合区服对局" description="我方查询主区服，敌方查询下方指定的区服。" />{draft.secondaryEnabled && <div className="form-field"><label htmlFor="secondary-region">敌方区服</label><select id="secondary-region" className="input" value={draft.secondaryRegion} onChange={e => update('secondaryRegion', e.target.value as Settings['secondaryRegion'])}>{SUPPORTED_REGIONS.map(key => <option key={key} value={key}>{REGION_LABELS[key]}</option>)}</select></div>}
      <Toggle checked={draft.autoQuery} onChange={v => update('autoQuery', v)} label="导入后自动查询" description="新阵容出现后取得战绩，查询结果逐位显示。" />
      <div className="form-grid"><div className="form-field"><label htmlFor="cache-minutes">缓存时间（分钟）</label><input id="cache-minutes" type="number" className="input" min={1} max={1440} value={draft.cacheMinutes} onChange={e => update('cacheMinutes', Number(e.target.value))} /><p>避免短时间内反复请求同一账号与舰船。</p></div><div className="form-field"><label htmlFor="retry-attempts">请求失败重试次数</label><select id="retry-attempts" className="input" value={draft.retryAttempts} onChange={e => update('retryAttempts', Number(e.target.value))}>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n} 次</option>)}</select></div></div>
    </section>
    <HealthPanel state={state} notify={notify} /></>}
    {section === 'ratings' && <>
    <section className="panel settings-panel"><div className="settings-section-heading"><span><Icon icon={faSliders} size={22} /></span><div><h2>评分与胜率</h2><p>采用已还原的评分逻辑，参数含义与实际计算保持一致。</p></div></div><div className="form-grid"><div className="form-field"><label htmlFor="ape-threshold">海猴胜率上限（≤ %）</label><input id="ape-threshold" className="input" type="number" step="0.1" min={0} max={100} value={draft.apeThreshold} onChange={e => update('apeThreshold', Number(e.target.value))} /></div><div className="form-field"><label htmlFor="elite-threshold">精英胜率下限（&gt; %）</label><input id="elite-threshold" className="input" type="number" step="0.1" min={0} max={100} value={draft.unicumThreshold} onChange={e => update('unicumThreshold', Number(e.target.value))} /></div></div><div className="form-grid"><div className="form-field"><label htmlFor="ape-min">海猴最少账号场次</label><input id="ape-min" className="input" type="number" min={0} max={1000000} value={draft.minApeBattles} onChange={e => update('minApeBattles', Number(e.target.value))} /></div><div className="form-field"><label htmlFor="elite-min">精英最少账号场次</label><input id="elite-min" className="input" type="number" min={0} max={1000000} value={draft.minUnicumBattles} onChange={e => update('minUnicumBattles', Number(e.target.value))} /></div></div>
      <h3 className="settings-subheading">加权胜率参数</h3><div className="weights-inputs">{([{ key: 'solo', label: '单排乘数' }, { key: 'div2', label: '双排乘数' }, { key: 'div3', label: '三排乘数' }] as const).map(item => <div className="form-field" key={item.key}><label htmlFor={`weight-${item.key}`}>{item.label}</label><input id={`weight-${item.key}`} className="input" type="number" min={0} max={10000} step="0.1" value={draft.weights[item.key]} onChange={e => weight(item.key, Number(e.target.value))} /></div>)}</div><div className="form-grid"><div className="form-field"><label htmlFor="ship-max">本舰最大占比（%）</label><input id="ship-max" className="input" type="number" min={0} max={100} step="1" value={draft.weights.shipMax} onChange={e => weight('shipMax', Number(e.target.value))} /></div><div className="form-field"><label htmlFor="ship-battles">达到最大占比的本舰场次</label><input id="ship-battles" className="input" type="number" min={0} max={100000} value={draft.weights.shipBattles} onChange={e => weight('shipBattles', Number(e.target.value))} /></div></div><div className="formula-note"><Icon icon={faShieldHalved} size={18} /><p>账号基线按「各模式场次 × 乘数」归一化；本舰占比随场次线性增加，至上限封顶。零本舰场次及无有效模式权重时回退账号胜率。</p></div>
    </section>
    </>}
    {section === 'text' && <>
    <section className="panel settings-panel"><div className="settings-section-heading"><span><Icon icon={faFont} size={22} /></span><div><h2>文本摘要</h2><p>按当前胜率口径生成，可编辑后手动复制。</p></div></div><div className="form-field"><label htmlFor="text-template">摘要模板</label><textarea id="text-template" className="input" rows={4} maxLength={4000} value={draft.textTemplate} onChange={e => update('textTemplate', e.target.value)} /><p>支持 {'{AllyUnicumList}'}、{'{AllyApeList}'}、{'{EnemyUnicumList}'}、{'{EnemyApeList}'}、双方 HiddenList 与 AvgAccountWinrate / AvgWeightedWinrate。</p></div><Toggle checked={draft.excludeSelf} onChange={v => update('excludeSelf', v)} label="摘要名单中排除自己" description="只影响文字名单，队伍统计仍保留自己。" /></section>
    </>}
    {section === 'about' && <>
    <UpdatePanel notify={notify} installBlocked={state.query.status === 'loading'} />
      <section className="panel settings-panel local-storage-panel"><div className="settings-section-heading"><span><Icon icon={faDatabase} size={22} /></span><div><h2>本地资料</h2><p>应用版本 {appPackage.version} · 船舶资料 {state.shipVersion}</p></div><Badge tone="brand"><Icon icon={faCircleCheck} size={12} />本地存储</Badge></div><p className="data-path">{state.dataLocation}</p><p className="text-xs muted">数据库包含设置、对局历史、关注名单和有时效的战绩缓存。关闭应用后再复制此文件进行备份。</p></section>
    </>}
    {section === 'general' && <div className="settings-reset"><span className="settings-description">更改即时生效，并自动保存在本机。</span><Button onClick={() => setResetOpen(true)}><Icon icon={faRotateLeft} size={14} />恢复默认设置</Button></div>}
    <Modal open={resetOpen} onOpenChange={setResetOpen} title="恢复默认设置" description="将主题、游戏目录、评分参数和摘要模板恢复到初始值。"><div className="dialog-footer"><Button onClick={() => setResetOpen(false)}>取消</Button><Button variant="primary" onClick={() => { change(structuredClone(DEFAULT_SETTINGS), 0); setResetOpen(false) }}>恢复默认设置</Button></div></Modal>
  </div>
}
