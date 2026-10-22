import { ShipGlyph } from './ShipGlyph.js'
import { WatchMenu } from './WatchMenu.js'
import { Empty, EmptyDescription, EmptyHeader } from '../ui/empty.js'
import { Spinner } from '../ui/spinner.js'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table.js'
import { Card } from '../ui/card.js'
import { faCircleExclamation, faEllipsis, faEyeSlash, faFlag, faStar } from '@fortawesome/free-solid-svg-icons'
import { Icon } from '../Icon.js'
import type { RadarPlayer, Settings, Team, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { SHIP_LABELS } from '@aperadar/shared/types'
import { formatNumber, formatPercent, playerRate, skillLevel, SKILL_LABELS } from '@aperadar/shared/statistics'
import { Badge, Button } from '../ui.js'

export function TeamTable({ team, players, averageWinrate, settings, watchlist, search, shipFilter, onPlayer, onWatch, onRetry, querying }: { team: Team; players: RadarPlayer[]; averageWinrate: number | null; settings: Settings; watchlist: WatchEntry[]; search: string; shipFilter: string; onPlayer: (key: string) => void; onWatch: (input: WatchInput) => void; onRetry: () => void; querying: boolean }) {
  // Preserve the game's imported roster order, including while statistics update.
  const visiblePlayers = players.filter(p => (!shipFilter || p.ship.type === shipFilter) && (!search || `${settings.showNames ? p.name + " " + p.clanTag : ""} ${p.ship.name} ${p.ship.nameEn}`.toLowerCase().includes(search.toLowerCase())))
  return <Card role="region" className={`gap-0 py-0 team-card team-${team}`} aria-label={team === 'ally' ? '我方阵容' : '敌方阵容'}>
    <div className="team-heading"><div className="flex items-center gap-2"><span className="team-icon"><Icon icon={faFlag} size={17} /></span><h2>{team === 'ally' ? '我方阵容' : '敌方阵容'}</h2><span className={`team-winrate text-${team}`} title={`${team === 'ally' ? '我方' : '敌方'}平均${settings.winrate === 'account' ? '账号' : '加权'}胜率：${formatPercent(averageWinrate)}`} aria-label={`${team === 'ally' ? '我方' : '敌方'}平均胜率 ${formatPercent(averageWinrate)}`}>{formatPercent(averageWinrate)}</span></div><span className="text-xs muted">{team === 'ally' ? 'ALLIED TEAM' : 'OPPOSING TEAM'}</span></div>
    <Table className="player-table"><TableHeader><TableRow><TableHead scope="col">舰长 / 舰船</TableHead><TableHead scope="col" className="winrate-column">胜率</TableHead><TableHead scope="col" className="damage-column" title="当前舰船累计伤害 ÷ 本舰场次">单船场均</TableHead><TableHead scope="col" className="battles-column">总场次</TableHead><TableHead scope="col"><span className="sr-only">关注操作</span><Icon icon={faEllipsis} size={17} /></TableHead></TableRow></TableHeader>
    <TableBody>{visiblePlayers.map(player => {
      const level = skillLevel(player, settings)
      const watch = watchlist.find(w => w.accountId === player.accountId && w.region === player.region)
      const masked = settings.showNames ? player.name : `${player.name.slice(0, 1)}${'•'.repeat(Math.min(player.name.length - 1, 9))}`
      const damage = player.stats?.shipAvailable && player.stats.ship.battles ? player.stats.ship.damage === null ? null : player.stats.ship.damage / player.stats.ship.battles : null
      return <TableRow key={player.key} className={[player.isSelf && 'self-row', player.status === 'hidden' && 'player-hidden'].filter(Boolean).join(' ')}>
        <TableCell><div className="player-identity"><span className={`ship-glyph ship-${player.ship.type}`} title={SHIP_LABELS[player.ship.type]}><ShipGlyph type={player.ship.type} /></span><Button variant="ghost" className="player-name-button" aria-label={`${settings.showNames ? player.name : "已隐藏舰长名称"} · ${player.ship.name}，查看详细统计`} onClick={() => onPlayer(player.key)}><span className="player-name-line"><span className="player-name">{settings.showNames && player.clanTag && <span className="clan-tag">[{player.clanTag}] </span>}{masked}{player.isSelf && <Badge tone="brand" className="ml-1 px-1 py-0 text-[10px] leading-tight">你</Badge>}</span>{player.status === 'hidden' && <Badge className="shrink-0 gap-1 px-1 py-0 text-[10px] leading-tight"><Icon icon={faEyeSlash} size={11} />战绩已隐藏</Badge>}</span><span className="ship-name"><span className="tier">{player.ship.tier === 11 ? <Icon icon={faStar} size={10} /> : ['','I','II','III','IV','V','VI','VII','VIII','IX','X'][player.ship.tier] ?? '?'}</span> {player.ship.name}<span className="ship-type-text"> · {SHIP_LABELS[player.ship.type]}</span></span></Button></div></TableCell>
        {player.status === 'ready' ? <><TableCell><span className={`rate rate-${level}`}>{formatPercent(playerRate(player, settings))}</span><Badge tone={level === 'elite' ? 'elite' : level === 'strong' ? 'success' : level === 'low' ? 'enemy' : 'neutral'} className="mt-0.5 px-1 py-0 text-[10px] leading-tight">{SKILL_LABELS[level]}</Badge></TableCell><TableCell className="damage-column numeric">{formatNumber(damage)}</TableCell><TableCell className="battles-column numeric">{formatNumber(player.stats?.overall.battles)}</TableCell></> : player.status === 'hidden' ? <><TableCell className="hidden-stats-cell" /><TableCell className="damage-column" /><TableCell className="battles-column" /></> : <><TableCell colSpan={2} className="status-cell">{player.status === 'pending' ? <Badge tone={querying ? 'brand' : 'neutral'}>{querying && <Spinner aria-hidden="true" className="size-3" />}{querying ? '正在查询…' : '等待查询'}</Badge> : player.status === 'bot' ? <Badge>AI 舰船</Badge> : <Button variant="ghost" onClick={onRetry} disabled={querying} className="retry-inline"><Icon icon={faCircleExclamation} size={15} />{player.status === 'not-found' ? '未找到账号' : '查询失败'}<span>重试</span></Button>}</TableCell><TableCell className="battles-column" /></>}
        <TableCell><WatchMenu name={settings.showNames ? player.name : "已隐藏舰长名称"} player={player} entry={watch} onWatch={onWatch} /></TableCell>
      </TableRow>
    })}</TableBody></Table>
    {visiblePlayers.length === 0 && <Empty className="py-8 md:py-8"><EmptyHeader><EmptyDescription>没有匹配的舰长或舰船，请调整筛选。</EmptyDescription></EmptyHeader></Empty>}
    <div className="team-footer"><span className="legend-dot" />{team === 'ally' ? '我方' : '敌方'}可见战绩 {players.filter(p => p.status === 'ready').length} / {players.length}<span className="ml-auto">{search || shipFilter ? `显示 ${visiblePlayers.length} 人` : '点击舰长查看详细统计'}</span></div>
  </Card>
}
