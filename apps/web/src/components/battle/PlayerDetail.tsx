import { cn } from '@/lib/utils.js'
import { Clock, Copy, ExternalLink, EyeOff, Save, ShieldCheck, Star, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { RadarPlayer, Settings, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { REGION_LABELS, SHIP_LABELS, isSupportedRegion } from '@aperadar/shared/types'
import { formatNumber, formatPercent, skillLevel, SKILL_LABELS, weightedWinrate, winrate } from '@aperadar/shared/statistics'
import { Icon } from '../Icon.js'
import { Modal, Button, Badge, ConfirmationDialog, EmptyState, InfoHint, Notice } from '../ui.js'
import { DialogFooter } from '../ui/dialog.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.js'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs.js'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table.js'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '../ui/field.js'
import { Input } from '../ui/input.js'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.js'
import { Separator } from '../ui/separator.js'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '../ui/item.js'
import { ShipGlyph } from './ShipGlyph.js'

export function PlayerDetail({ player, settings, watchlist, onClose, onWatch, onCopy, onProfile }: { player: RadarPlayer | null; settings: Settings; watchlist: WatchEntry[]; onClose: () => void; onWatch: (input: WatchInput) => Promise<boolean>; onCopy: (text: string) => void; onProfile: (player: RadarPlayer) => void }) {
  const [mode, setMode] = useState<'account' | 'ship'>('account')
  const entry = player ? watchlist.find(w => w.accountId === player.accountId && w.region === player.region) : undefined
  const [note, setNote] = useState(entry?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [watchError, setWatchError] = useState('')
  const [watchMessage, setWatchMessage] = useState('')
  const [removing, setRemoving] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const detailTrigger = useRef(document.activeElement as HTMLElement | null)
  const dirty = note !== (entry?.note ?? '')
  async function saveWatch(status: WatchEntry['status'] | null) {
    if (!player?.accountId) return false
    setSaving(true)
    setWatchError('')
    setWatchMessage('')
    try {
      const saved = await onWatch({ region: player.region, accountId: player.accountId, name: player.name, status, note })
      if (!saved) { setWatchError('关注未保存，备注已保留，请重试。'); return false }
      if (status === null) setNote('')
      setWatchMessage(status === null ? '关注记录已移除。' : '关注类型与备注已保存。')
      return true
    } catch {
      setWatchError('关注未保存，备注已保留，请重试。')
      return false
    } finally { setSaving(false) }
  }
  function requestClose() {
    if (saving) return
    if (dirty) setDiscarding(true)
    else onClose()
  }
  if (!player) return null
  const level = skillLevel(player, settings), stats = player.stats
  const name = settings.showNames ? player.name : '已隐藏舰长名称'
  const current = mode === 'account' ? stats && [stats.overall, stats.solo, stats.div2, stats.div3] : stats && [stats.ship, stats.shipSolo, stats.shipDiv2, stats.shipDiv3]
  const description = `${REGION_LABELS[player.region]} · ${player.ship.tier} 级 ${SHIP_LABELS[player.ship.type]} · ${player.ship.name}`
  const output = `${name}（${player.ship.name}）账号 ${formatNumber(stats?.overall.battles)} 场，胜率 ${formatPercent(winrate(stats?.overall))}，加权 ${formatPercent(weightedWinrate(player, settings))}，单船 ${stats?.shipAvailable ? formatPercent(winrate(stats.ship)) : '—'}。`
  return <Modal open onOpenChange={open => { if (!open) requestClose() }} title={name} description={description} className="@container auto-rows-min sm:max-w-xl">
    <Card className="min-h-fit gap-0 overflow-hidden rounded-xl bg-muted/30 py-0 shadow-none">
      <CardHeader className="p-0">
      <Item className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-none border-0 p-4 @min-[420px]:grid-cols-[auto_minmax(0,1fr)_auto] @min-[420px]:p-5">
        <ItemMedia className="size-14 rounded-xl border border-border bg-card shadow-sm group-has-[[data-slot=item-description]]/item:translate-y-0 group-has-[[data-slot=item-description]]/item:self-center"><ShipGlyph type={player.ship.type} size={32} /></ItemMedia>
        <ItemContent className="min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <ItemTitle className="min-w-0 text-xl"><CardTitle><h3 className="break-words [overflow-wrap:anywhere]">{player.ship.name}</h3></CardTitle></ItemTitle>
            <Badge className="shrink-0 text-xs" tone={level === 'elite' ? 'elite' : level === 'strong' ? 'success' : 'brand'}>{player.status === 'hidden' ? '战绩隐藏' : SKILL_LABELS[level]}</Badge>
          </div>
          <CardDescription className="break-words text-xs [overflow-wrap:anywhere]">
            {player.ship.nameEn}
            {player.clanTag && settings.showNames && <span className="ml-2 inline-block font-medium">[{player.clanTag}]</span>}
          </CardDescription>
        </ItemContent>
        <ItemContent className="col-span-2 flex-row items-center justify-between gap-2 border-t border-border pt-3 @min-[420px]:col-span-1 @min-[420px]:flex-col @min-[420px]:items-end @min-[420px]:gap-1 @min-[420px]:border-t-0 @min-[420px]:border-l @min-[420px]:pl-5 @min-[420px]:pt-0">
          <ItemDescription className="text-xs">账号胜率</ItemDescription>
          <ItemTitle className={cn(`whitespace-nowrap text-3xl font-semibold tracking-tight tabular-nums rate-${level}`)}>{formatPercent(winrate(stats?.overall))}</ItemTitle>
        </ItemContent>
      </Item>
      </CardHeader>
      {player.status !== 'hidden' && stats && <CardContent className="p-0"><Separator /><ItemGroup className="grid grid-cols-3 gap-0 bg-card/70 p-1" aria-label="舰长统计摘要">
        {[{ label: '加权胜率', value: formatPercent(weightedWinrate(player, settings)) }, { label: '账号场次', value: formatNumber(stats.overall.battles) }, { label: '业力', value: formatNumber(stats.karma) }].map(metric => <Item role="listitem" size="sm" className="min-w-0 rounded-none border-0 border-r border-border px-3 last:border-r-0 @min-[420px]:px-4" key={metric.label}><ItemContent className="min-w-0 gap-1.5"><ItemDescription className="text-xs">{metric.label}</ItemDescription><ItemTitle className="break-all text-lg font-semibold tabular-nums">{metric.value}</ItemTitle></ItemContent></Item>)}
      </ItemGroup></CardContent>}
    </Card>
    {player.status === 'hidden' ? <EmptyState icon={<Icon icon={EyeOff} />} title="这位舰长隐藏了战绩">未取得的统计不会被当作零场或低胜率。</EmptyState>
      : !stats ? <EmptyState icon={<Icon icon={Clock} />} title="尚未取得公开统计">{player.error ?? '在海猴雷达中发起战绩查询。'}</EmptyState>
        : <>
          <Tabs value={mode} onValueChange={value => setMode(value as typeof mode)}>
            <TabsList className="w-full" aria-label="统计范围"><TabsTrigger value="account">账号统计</TabsTrigger><TabsTrigger value="ship">单船统计</TabsTrigger></TabsList>
            <TabsContent value={mode}>
              <Table className="text-xs tabular-nums">
                <TableHeader><TableRow><TableHead scope="col">模式</TableHead><TableHead scope="col" className="text-right">场次</TableHead><TableHead scope="col" className="text-right">胜率</TableHead><TableHead scope="col" className="text-right"><span className="inline-flex items-center gap-1">{mode === 'ship' ? '单船场均' : '场均经验'}<InfoHint label={mode === 'ship' ? '单船场均计算说明' : '场均经验计算说明'}>{mode === 'ship' ? '单船累计伤害 ÷ 单船场次' : '账号累计经验 ÷ 账号场次'}</InfoHint></span></TableHead></TableRow></TableHeader>
                <TableBody>{current?.map((stat, i) => <TableRow key={i}><TableCell>{['全部随机战', '单排', '双人组队', '三人组队'][i]}</TableCell><TableCell className="text-right">{formatNumber(mode === 'ship' && !stats.shipAvailable ? null : stat.battles)}</TableCell><TableCell className="text-right">{formatPercent(mode === 'ship' && !stats.shipAvailable ? null : winrate(stat))}</TableCell><TableCell className="text-right">{formatNumber(mode === 'ship' && !stats.shipAvailable ? null : stat.battles ? (mode === 'ship' ? stat.damage : stat.xp) === null ? null : (mode === 'ship' ? stat.damage! : stat.xp!) / stat.battles : 0)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </TabsContent>
          </Tabs>
          {player.error && <Notice role="alert" variant="destructive" icon={<Icon icon={Clock} />}>{player.error}</Notice>}
          <Notice icon={<Icon icon={ShieldCheck} />}>加权算法采用模式场次 × {settings.weights.solo}:{settings.weights.div2}:{settings.weights.div3}，再混合最高 {settings.weights.shipMax}% 的单船成绩。<br />本舰零场或权重分母为零时，回退账号胜率。</Notice>
        </>}
    {player.accountId && <FieldSet disabled={saving}>
      <FieldLegend variant="label"><span className="inline-flex items-center gap-2"><Icon icon={Star} />本地关注</span></FieldLegend>
      <FieldGroup className="gap-4">
        <Field><FieldLabel htmlFor="player-watch-note">备注</FieldLabel><Input id="player-watch-note" maxLength={500} value={note} aria-describedby="player-watch-description" placeholder="例如：配合出色、留待观察…" onChange={event => { setNote(event.target.value); setWatchMessage(''); setWatchError('') }} /><FieldDescription id="player-watch-description">{entry ? '修改备注后点击保存；切换关注类型也会保存当前备注。' : '选择一种关注类型，即可保存当前备注。'}</FieldDescription></Field>
        <Field><FieldTitle id="player-watch-type">关注类型</FieldTitle><ToggleGroup type="single" variant="outline" spacing={2} className="flex-wrap" aria-labelledby="player-watch-type" value={entry?.status ?? ''} disabled={saving} onValueChange={value => {
          if (value) void saveWatch(value as WatchEntry['status'])
          else if (entry) setRemoving(true)
        }}>{([{ status: 'positive', label: '值得信赖' }, { status: 'negative', label: '需要留意' }, { status: 'suspected', label: '疑似异常' }] as const).map(option => <ToggleGroupItem key={option.status} value={option.status}>{option.label}</ToggleGroupItem>)}</ToggleGroup></Field>
        <div className="flex flex-wrap gap-2"><Button variant="default" busy={saving} disabled={!entry || !dirty} onClick={() => { if (entry) void saveWatch(entry.status) }}><Icon icon={Save} />保存备注</Button>{entry && <Button disabled={saving} onClick={() => setRemoving(true)}><Icon icon={Trash2} />移除关注</Button>}</div>
        {watchError && <Notice role="alert" variant="destructive">{watchError}</Notice>}
        {watchMessage && <FieldDescription role="status">{watchMessage}</FieldDescription>}
      </FieldGroup>
    </FieldSet>}
    <Separator />
    <DialogFooter className="flex-wrap items-center"><span className="text-xs text-muted-foreground sm:mr-auto">{player.fetchedAt ? `${player.cached ? '本地缓存' : '查询时间'} · ${new Date(player.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '尚无查询时间'}</span><Button onClick={() => onCopy(output)}><Icon icon={Copy} />复制摘要</Button>{isSupportedRegion(player.region) && player.accountId && !player.accountId.startsWith('demo-') && <Button onClick={() => onProfile(player)}><Icon icon={ExternalLink} />官方战绩</Button>}</DialogFooter>
    <ConfirmationDialog open={removing} onOpenChange={setRemoving} title="移除关注记录？" description="这将删除此舰长的本地标记和备注，对局历史会保留。" actionLabel="移除关注" cancelLabel="保留记录" onConfirm={() => saveWatch(null)} />
    <ConfirmationDialog open={discarding} onOpenChange={setDiscarding} focusTarget={detailTrigger} title="放弃未保存的备注？" description="当前备注尚未保存。可以返回继续编辑，或放弃更改并关闭详情。" actionLabel="放弃更改" cancelLabel="继续编辑" onConfirm={() => { onClose() }} />
  </Modal>
}
