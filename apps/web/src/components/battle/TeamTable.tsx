import { CircleAlert, Ellipsis, EyeOff, Flag, Star } from 'lucide-react'
import type { RadarPlayer, Settings, Team, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { SHIP_LABELS } from '@aperadar/shared/types'
import { formatNumber, formatPercent, playerRate, skillLevel, SKILL_LABELS } from '@aperadar/shared/statistics'
import { sortRosterPlayers } from '@aperadar/shared/roster'
import { cn } from '../../lib/utils.js'
import { Icon } from '../Icon.js'
import { Badge, Button, Hint, InfoHint } from '../ui.js'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card.js'
import { Empty, EmptyDescription, EmptyHeader } from '../ui/empty.js'
import { Separator } from '../ui/separator.js'
import { Spinner } from '../ui/spinner.js'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table.js'
import { ShipGlyph } from './ShipGlyph.js'
import { WatchMenu } from './WatchMenu.js'

export function TeamTable({ team, players, averageWinrate, settings, watchlist, onPlayer, onWatch, onRetry, querying }: { team: Team; players: RadarPlayer[]; averageWinrate: number | null; settings: Settings; watchlist: WatchEntry[]; onPlayer: (key: string) => void; onWatch: (input: WatchInput) => Promise<boolean>; onRetry: () => void; querying: boolean }) {
  const orderedPlayers = sortRosterPlayers(players)
  const teamName = team === 'ally' ? '我方' : '敌方'
  const averageLabel = `${teamName}平均${settings.winrate === 'account' ? '账号' : '加权'}胜率：${formatPercent(averageWinrate)}`
  return <Card role="region" className={cn('gap-0 py-0 team-card', `team-${team}`)} aria-label={`${teamName}阵容`}>
    <CardHeader className="team-heading">
      <CardTitle className="flex min-w-0 items-baseline gap-2"><span className="team-icon"><Icon icon={Flag} /></span><h2>{teamName}阵容</h2><Hint content={averageLabel}><span tabIndex={0} className={cn('team-winrate', `text-${team}`)} aria-label={averageLabel}>{formatPercent(averageWinrate)}</span></Hint></CardTitle>
      <CardDescription className="team-english-name">{team === 'ally' ? 'ALLIED TEAM' : 'OPPOSING TEAM'}</CardDescription>
    </CardHeader>
    <Separator />
    <CardContent className="p-0">
      <Table className="player-table">
        <TableHeader><TableRow>
          <TableHead scope="col">舰长 / 舰船</TableHead><TableHead scope="col" className="winrate-column">胜率</TableHead>
          <TableHead scope="col" className="damage-column"><InfoHint label="单船场均计算说明" text="单船场均">当前舰船累计伤害 ÷ 本舰场次</InfoHint></TableHead>
          <TableHead scope="col" className="battles-column">总场次</TableHead><TableHead scope="col"><span className="sr-only">关注操作</span><Icon icon={Ellipsis} /></TableHead>
        </TableRow></TableHeader>
        <TableBody>{orderedPlayers.map(player => {
          const level = skillLevel(player, settings)
          const watch = watchlist.find(w => w.accountId === player.accountId && w.region === player.region)
          const name = settings.showNames ? player.name : '已隐藏舰长名称'
          const masked = settings.showNames ? player.name : `${player.name.slice(0, 1)}${'•'.repeat(Math.min(player.name.length - 1, 9))}`
          const damage = player.stats?.shipAvailable && player.stats.ship.battles ? player.stats.ship.damage === null ? null : player.stats.ship.damage / player.stats.ship.battles : null
          return <TableRow key={player.key} className={cn(player.isSelf && 'self-row', player.status === 'hidden' && 'player-hidden')}>
            <TableCell><div className="player-identity">
              <span className={cn('ship-glyph', `ship-${player.ship.type}`)}><span className="sr-only">{SHIP_LABELS[player.ship.type]}</span><ShipGlyph type={player.ship.type} /></span>
              <Hint content={`${name} · ${player.ship.name}`}><Button variant="plain" className="player-name-button" aria-label={`${name} · ${player.ship.name}，查看详细统计`} onClick={() => onPlayer(player.key)}>
                <span className="player-name-line"><span className="player-name truncate">{settings.showNames && player.clanTag && <span className="clan-tag">[{player.clanTag}] </span>}{masked}</span>{player.isSelf && <Badge tone="brand" className="shrink-0 px-1 py-0">你</Badge>}</span>
                <span className="player-ship-line"><span className="ship-name truncate"><span className="tier">{player.ship.tier === 11 ? <Icon icon={Star} /> : ['','I','II','III','IV','V','VI','VII','VIII','IX','X'][player.ship.tier] ?? '?'}</span> {player.ship.name}</span>
                  {player.status === 'hidden' && <Badge className="player-status px-1 py-0"><Icon icon={EyeOff} />战绩已隐藏</Badge>}
                </span>
              </Button></Hint>
            </div></TableCell>
            {player.status === 'ready' ? <>
              <TableCell><span className={cn('rate', `rate-${level}`)}>{formatPercent(playerRate(player, settings))}</span><Badge tone={level === 'elite' ? 'elite' : level === 'strong' ? 'success' : level === 'low' ? 'enemy' : 'neutral'} className="mt-0.5 px-1 py-0">{SKILL_LABELS[level]}</Badge></TableCell>
              <TableCell className="damage-column numeric">{formatNumber(damage)}</TableCell><TableCell className="battles-column numeric">{formatNumber(player.stats?.overall.battles)}</TableCell>
            </> : player.status === 'hidden' ? <><TableCell className="hidden-stats-cell" /><TableCell className="damage-column" /><TableCell className="battles-column" /></> : <>
              <TableCell colSpan={2} className="status-cell">{player.status === 'pending' ? <Badge tone={querying ? 'brand' : 'neutral'}>{querying && <Spinner aria-hidden="true" />}{querying ? '正在查询…' : '等待查询'}</Badge> : player.status === 'bot' ? <Badge>AI 舰船</Badge> : <Button variant="ghost" onClick={onRetry} disabled={querying} className="retry-inline"><Icon icon={CircleAlert} />{player.status === 'not-found' ? '未找到账号' : '查询失败'}<span>重试</span></Button>}</TableCell><TableCell className="battles-column" />
            </>}
            <TableCell><WatchMenu name={name} player={player} entry={watch} onWatch={onWatch} /></TableCell>
          </TableRow>
        })}</TableBody>
      </Table>
      {players.length === 0 && <Empty className="py-8 md:py-8"><EmptyHeader><EmptyDescription>暂无舰长或舰船数据。</EmptyDescription></EmptyHeader></Empty>}
    </CardContent>
    <Separator />
    <CardFooter className="team-footer"><span className="legend-dot" />{teamName}可见战绩 {players.filter(p => p.status === 'ready').length} / {players.length}<span className="ml-auto">点击舰长查看详细统计</span></CardFooter>
  </Card>
}
