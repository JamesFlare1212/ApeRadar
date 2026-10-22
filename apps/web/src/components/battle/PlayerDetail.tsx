import { useState } from 'react'
import { faArrowUpRightFromSquare, faCopy, faStar, faShieldHalved, faClock, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import type { RadarPlayer, Settings, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { REGION_LABELS, SHIP_LABELS, isSupportedRegion } from '@aperadar/shared/types'
import { formatNumber, formatPercent, skillLevel, SKILL_LABELS, weightedWinrate, winrate } from '@aperadar/shared/statistics'
import { Icon } from '../Icon.js'
import { Modal, Button, Badge, EmptyState, Notice } from '../ui.js'
import { DialogFooter } from '../ui/dialog.js'
import { Card } from '../ui/card.js'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs.js'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table.js'
import { Field, FieldLabel } from '../ui/field.js'
import { Input } from '../ui/input.js'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '../ui/item.js'
import { ShipGlyph } from './ShipGlyph.js'

export function PlayerDetail({ player, settings, watchlist, onClose, onWatch, onCopy, onProfile }: { player: RadarPlayer | null; settings: Settings; watchlist: WatchEntry[]; onClose: () => void; onWatch: (input: WatchInput) => void; onCopy: (text: string) => void; onProfile: (player: RadarPlayer) => void }) {
  const [mode, setMode] = useState<'account' | 'ship'>('account')
  const entry = player ? watchlist.find(w => w.accountId === player.accountId && w.region === player.region) : undefined
  const [note, setNote] = useState(entry?.note ?? '')
  if (!player) return null
  const level = skillLevel(player, settings), stats = player.stats
  const name = settings.showNames ? player.name : '已隐藏舰长名称'
  const current = mode === 'account' ? stats && [stats.overall, stats.solo, stats.div2, stats.div3] : stats && [stats.ship, stats.shipSolo, stats.shipDiv2, stats.shipDiv3]
  const description = `${REGION_LABELS[player.region]} · ${player.ship.tier} 级 ${SHIP_LABELS[player.ship.type]} · ${player.ship.name}`
  const output = `${name}（${player.ship.name}）账号 ${formatNumber(stats?.overall.battles)} 场，胜率 ${formatPercent(winrate(stats?.overall))}，加权 ${formatPercent(weightedWinrate(player, settings))}，单船 ${stats?.shipAvailable ? formatPercent(winrate(stats.ship)) : '—'}。`
  return <Modal open onOpenChange={open => { if (!open) onClose() }} title={name} description={description} className="@container auto-rows-min sm:max-w-xl">
    <Card className="min-h-fit gap-0 overflow-hidden rounded-xl bg-muted/30 py-0 shadow-none">
      <Item className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-none border-0 p-4 @min-[420px]:grid-cols-[auto_minmax(0,1fr)_auto] @min-[420px]:p-5">
        <ItemMedia className="size-14 rounded-xl border border-border bg-card shadow-sm group-has-[[data-slot=item-description]]/item:translate-y-0 group-has-[[data-slot=item-description]]/item:self-center"><ShipGlyph type={player.ship.type} size={32} /></ItemMedia>
        <ItemContent className="min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <ItemTitle className="min-w-0 text-xl font-semibold"><h3 className="break-words [overflow-wrap:anywhere]">{player.ship.name}</h3></ItemTitle>
            <Badge className="shrink-0 text-xs" tone={level === 'elite' ? 'elite' : level === 'strong' ? 'success' : 'brand'}>{player.status === 'hidden' ? '战绩隐藏' : SKILL_LABELS[level]}</Badge>
          </div>
          <ItemDescription className="line-clamp-none break-words text-xs [overflow-wrap:anywhere]">
            {player.ship.nameEn}
            {player.clanTag && settings.showNames && <span className="ml-2 inline-block font-medium">[{player.clanTag}]</span>}
          </ItemDescription>
        </ItemContent>
        <ItemContent className="col-span-2 flex-row items-center justify-between gap-2 border-t border-border pt-3 @min-[420px]:col-span-1 @min-[420px]:flex-col @min-[420px]:items-end @min-[420px]:gap-1 @min-[420px]:border-t-0 @min-[420px]:border-l @min-[420px]:pl-5 @min-[420px]:pt-0">
          <ItemDescription className="text-xs">账号胜率</ItemDescription>
          <ItemTitle className={`whitespace-nowrap text-3xl font-semibold tracking-tight tabular-nums rate-${level}`}>{formatPercent(winrate(stats?.overall))}</ItemTitle>
        </ItemContent>
      </Item>
      {player.status !== 'hidden' && stats && <ItemGroup className="grid grid-cols-3 gap-0 border-t border-border bg-card/70 p-1" aria-label="舰长统计摘要">
        {[{ label: '加权胜率', value: formatPercent(weightedWinrate(player, settings)) }, { label: '账号场次', value: formatNumber(stats.overall.battles) }, { label: '业力', value: formatNumber(stats.karma) }].map(metric => <Item role="listitem" size="sm" className="min-w-0 rounded-none border-0 border-r border-border px-3 last:border-r-0 @min-[420px]:px-4" key={metric.label}><ItemContent className="min-w-0 gap-1.5"><ItemDescription className="text-xs">{metric.label}</ItemDescription><ItemTitle className="break-all text-lg font-semibold tabular-nums">{metric.value}</ItemTitle></ItemContent></Item>)}
      </ItemGroup>}
    </Card>
    {player.status === 'hidden' ? <EmptyState icon={<Icon icon={faEyeSlash} size={28} />} title="这位舰长隐藏了战绩">未取得的统计不会被当作零场或低胜率。</EmptyState>
      : !stats ? <EmptyState icon={<Icon icon={faClock} size={28} />} title="尚未取得公开统计">{player.error ?? '在海猴雷达中发起战绩查询。'}</EmptyState>
        : <>
          <Tabs value={mode} onValueChange={value => setMode(value as typeof mode)}>
            <TabsList className="w-full" aria-label="统计范围"><TabsTrigger value="account">账号统计</TabsTrigger><TabsTrigger value="ship">单船统计</TabsTrigger></TabsList>
            <TabsContent value={mode}>
              <Table className="text-xs tabular-nums">
                <TableHeader><TableRow><TableHead scope="col">模式</TableHead><TableHead scope="col" className="text-right">场次</TableHead><TableHead scope="col" className="text-right">胜率</TableHead><TableHead scope="col" className="text-right" title={mode === 'ship' ? '单船累计伤害 ÷ 单船场次' : '账号累计经验 ÷ 账号场次'}>{mode === 'ship' ? '单船场均' : '场均经验'}</TableHead></TableRow></TableHeader>
                <TableBody>{current?.map((stat, i) => <TableRow key={i}><TableCell>{['全部随机战', '单排', '双人组队', '三人组队'][i]}</TableCell><TableCell className="text-right">{formatNumber(mode === 'ship' && !stats.shipAvailable ? null : stat.battles)}</TableCell><TableCell className="text-right">{formatPercent(mode === 'ship' && !stats.shipAvailable ? null : winrate(stat))}</TableCell><TableCell className="text-right">{formatNumber(mode === 'ship' && !stats.shipAvailable ? null : stat.battles ? (mode === 'ship' ? stat.damage : stat.xp) === null ? null : (mode === 'ship' ? stat.damage! : stat.xp!) / stat.battles : 0)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </TabsContent>
          </Tabs>
          {player.error && <Notice role="alert" variant="destructive" icon={<Icon icon={faClock} size={16} />}>{player.error}</Notice>}
          <Notice icon={<Icon icon={faShieldHalved} size={18} />}>加权算法采用模式场次 × {settings.weights.solo}:{settings.weights.div2}:{settings.weights.div3}，再混合最高 {settings.weights.shipMax}% 的单船成绩。<br />本舰零场或权重分母为零时，回退账号胜率。</Notice>
        </>}
    {player.accountId && <Field><FieldLabel htmlFor="player-watch-note"><Icon icon={faStar} size={16} />本地关注备注</FieldLabel><Input id="player-watch-note" maxLength={500} value={note} placeholder="例如：配合出色、留待观察…" onChange={event => setNote(event.target.value)} /><div className="flex flex-wrap gap-2">{([{ status: 'positive', label: '值得信赖' }, { status: 'negative', label: '需要留意' }, { status: 'suspected', label: '疑似异常' }] as const).map(option => <Button key={option.status} aria-pressed={entry?.status === option.status} variant={entry?.status === option.status ? 'default' : 'outline'} onClick={() => onWatch({ region: player.region, accountId: player.accountId!, name: player.name, status: entry?.status === option.status ? null : option.status, note })}>{option.label}</Button>)}</div></Field>}
    <DialogFooter className="flex-wrap items-center border-t pt-4"><span className="text-xs text-muted-foreground sm:mr-auto">{player.fetchedAt ? `${player.cached ? '本地缓存' : '查询时间'} · ${new Date(player.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '尚无查询时间'}</span><Button onClick={() => onCopy(output)}><Icon icon={faCopy} size={16} />复制摘要</Button>{isSupportedRegion(player.region) && player.accountId && !player.accountId.startsWith('demo-') && <Button onClick={() => onProfile(player)}><Icon icon={faArrowUpRightFromSquare} size={16} />官方战绩</Button>}</DialogFooter>
  </Modal>
}
