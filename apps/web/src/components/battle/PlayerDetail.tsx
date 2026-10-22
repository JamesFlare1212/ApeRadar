import { useState } from 'react'
import { faArrowUpRightFromSquare, faCopy, faStar, faShieldHalved, faClock, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import type { RadarPlayer, Settings, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { REGION_LABELS, SHIP_LABELS, isSupportedRegion } from '@aperadar/shared/types'
import { formatNumber, formatPercent, skillLevel, SKILL_LABELS, weightedWinrate, winrate } from '@aperadar/shared/statistics'
import { Icon } from '../Icon.js'
import { Modal, Button, Badge, EmptyState, Notice } from '../ui.js'
import { DialogFooter } from '../ui/dialog.js'
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
  return <Modal open onOpenChange={open => { if (!open) onClose() }} title={name} description={description} className="sm:max-w-xl">
    <Item variant="muted" className="flex-nowrap">
      <ItemMedia className="self-center"><ShipGlyph type={player.ship.type} size={40} /></ItemMedia>
      <ItemContent className="min-w-0 gap-2">
        <Badge tone={level === 'elite' ? 'elite' : level === 'strong' ? 'success' : 'brand'}>{player.status === 'hidden' ? '战绩隐藏' : SKILL_LABELS[level]}</Badge>
        <ItemTitle><h3>{player.ship.name}</h3></ItemTitle>
        <ItemDescription className="line-clamp-none break-words text-xs">{player.ship.nameEn}{player.clanTag && settings.showNames ? ` · [${player.clanTag}]` : ''}</ItemDescription>
      </ItemContent>
      <ItemContent className="ml-auto shrink-0 items-end text-right">
        <ItemTitle className={`text-xl tabular-nums rate-${level}`}>{formatPercent(winrate(stats?.overall))}</ItemTitle>
        <ItemDescription className="text-xs">账号胜率</ItemDescription>
      </ItemContent>
    </Item>
    {player.status === 'hidden' ? <EmptyState icon={<Icon icon={faEyeSlash} size={28} />} title="这位舰长隐藏了战绩">未取得的统计不会被当作零场或低胜率。</EmptyState>
      : !stats ? <EmptyState icon={<Icon icon={faClock} size={28} />} title="尚未取得公开统计">{player.error ?? '在海猴雷达中发起战绩查询。'}</EmptyState>
        : <>
          <ItemGroup className="grid grid-cols-3 gap-2" aria-label="舰长统计摘要">
            {[{ label: '加权胜率', value: formatPercent(weightedWinrate(player, settings)) }, { label: '账号场次', value: formatNumber(stats.overall.battles) }, { label: '业力', value: formatNumber(stats.karma) }].map(metric => <Item role="listitem" variant="outline" size="sm" className="min-w-0 px-3" key={metric.label}><ItemContent className="min-w-0"><ItemDescription className="text-xs">{metric.label}</ItemDescription><ItemTitle className="break-all text-base tabular-nums sm:text-lg">{metric.value}</ItemTitle></ItemContent></Item>)}
          </ItemGroup>
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
    {player.accountId && <Field><FieldLabel htmlFor="player-watch-note"><Icon icon={faStar} size={16} />本地关注备注</FieldLabel><Input id="player-watch-note" maxLength={500} value={note} placeholder="例如：配合出色、留待观察…" onChange={event => setNote(event.target.value)} /><div className="flex flex-wrap gap-2">{([{ status: 'positive', label: '值得信赖' }, { status: 'negative', label: '需要留意' }, { status: 'suspected', label: '疑似异常' }] as const).map(option => <Button key={option.status} variant={entry?.status === option.status ? 'default' : 'outline'} onClick={() => onWatch({ region: player.region, accountId: player.accountId!, name: player.name, status: option.status, note })}>{option.label}</Button>)}</div></Field>}
    <DialogFooter className="flex-wrap items-center border-t pt-4"><span className="text-xs text-muted-foreground sm:mr-auto">{player.fetchedAt ? `${player.cached ? '本地缓存' : '查询时间'} · ${new Date(player.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '尚无查询时间'}</span><Button onClick={() => onCopy(output)}><Icon icon={faCopy} size={16} />复制摘要</Button>{isSupportedRegion(player.region) && player.accountId && !player.accountId.startsWith('demo-') && <Button onClick={() => onProfile(player)}><Icon icon={faArrowUpRightFromSquare} size={16} />官方战绩</Button>}</DialogFooter>
  </Modal>
}
