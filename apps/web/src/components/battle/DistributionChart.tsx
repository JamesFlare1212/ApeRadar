import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { faChartLine } from '@fortawesome/free-solid-svg-icons'
import type { Battle, Settings, Team } from '@aperadar/shared/types'
import { formatPercent } from '@aperadar/shared/statistics'
import { buildRankedWinrateChart } from '@aperadar/shared/winrate-chart'
import { rankedChartRows, type RankedChartRow } from '../../lib/rankedChartData.js'
import { Icon } from '../Icon.js'
import { EmptyState } from '../ui.js'
import { Card, CardContent, CardHeader } from '../ui/card.js'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltipContent } from '../ui/chart.js'

const teamNames: Record<Team, string> = { ally: '我方', enemy: '敌方' }

export function DistributionChart({ battle, settings }: { battle: Battle; settings: Settings }) {
  const descriptionId = useId()
  const tooltipId = useId()
  const plot = useRef<HTMLDivElement>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [active, setActive] = useState<{ team: Team; key: string; x: number; y: number } | null>(null)
  const data = useMemo(() => buildRankedWinrateChart(battle, settings), [battle, settings])
  const rows = useMemo(() => rankedChartRows(data), [data])
  const basis = settings.winrate === 'account' ? '账号胜率' : '加权胜率'
  const point = active && rows.flatMap(row => [row.allyPoint, row.enemyPoint]).find(entry => entry?.team === active.team && entry.player.key === active.key)
  const cancelDismiss = () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); dismissTimer.current = null }
  const dismiss = () => {
    cancelDismiss()
    if (plot.current?.contains(document.activeElement) && document.activeElement?.matches('.winrate-point')) return
    dismissTimer.current = setTimeout(() => setActive(null), 150)
  }
  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }, [])
  useEffect(() => { setActive(null) }, [battle.id, settings.winrate, settings.showNames, data.min, data.max])
  const config = {
    ally: { label: `我方 ${data.counts.ally} 人`, color: 'var(--ally)' },
    enemy: { label: `敌方 ${data.counts.enemy} 人`, color: 'var(--enemy)' },
  }

  // Keep the chart subtree stable so tooltip updates preserve the focused SVG point.
  const chart = useMemo(() => {
    function renderPoint(team: Team, props: { cx?: number; cy?: number; payload?: RankedChartRow }) {
      const entry = props.payload?.[`${team}Point`]
      if (!entry || props.cx === undefined || props.cy === undefined) return <g />
      const x = props.cx, y = props.cy
      const show = () => { cancelDismiss(); setActive({ team, key: entry.player.key, x, y }) }
      const label = `${teamNames[team]}，队内升序第 ${entry.rank} / ${data.counts[team]} 位，${settings.showNames ? `${entry.player.name}，` : ''}${entry.player.ship.name}，${basis} ${formatPercent(entry.rate)}`
      return <circle key={`${team}:${entry.player.key}`} className={`winrate-point winrate-point-${team}`} cx={x} cy={y} r={4.5} fill={`var(--color-${team})`} stroke="var(--surface)" strokeWidth={1.5} tabIndex={0} role="img" aria-label={label} aria-describedby={tooltipId} data-team={team} data-rank={entry.rank} data-rate={entry.rate}
        onPointerEnter={show} onPointerLeave={dismiss} onFocus={show} onBlur={dismiss} onClick={show}
        onKeyDown={event => { if (event.key === 'Escape') { cancelDismiss(); setActive(null) } }} />
    }
    return <LineChart data={rows} margin={{ top: 12, right: 14, bottom: 20, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis type="number" dataKey="position" domain={[0, 1]} ticks={[0, .5, 1]} tickLine={false} axisLine={false} tickMargin={10} tickFormatter={value => value === 0 ? '低胜率' : value === 1 ? '高胜率' : '队内相对顺序'} />
            <YAxis type="number" domain={[data.min, data.max]} ticks={data.ticks} interval={0} width={52} tickLine={false} axisLine={false} tickFormatter={value => formatPercent(value, 0)} />
            <ChartLegend content={<ChartLegendContent />} verticalAlign="top" align="right" />

            {(['ally', 'enemy'] as const).map(team => <Line key={team} type="monotoneX" dataKey={team} name={team} stroke={`var(--color-${team})`} strokeWidth={2.5} connectNulls isAnimationActive={false} activeDot={false} dot={props => renderPoint(team, props)} />)}
          </LineChart>
  }, [rows, data, basis, settings.showNames, tooltipId])

  return <Card role="region" aria-label="胜率分布">
    <CardHeader><h2 className="flex items-center gap-2 font-semibold"><Icon icon={faChartLine} size={18} />胜率分布</h2><p className="text-sm text-muted-foreground">{basis} · 双方各自从低到高</p></CardHeader>
    <CardContent>
      <p id={descriptionId} className="sr-only">纵轴为{basis}，双方分别按胜率从低到高排列，横向位置表示队内相对顺序。每个圆点代表一位玩家，我方 {data.counts.ally} 人，敌方 {data.counts.enemy} 人。隐藏或未取得的战绩不计入。悬停或聚焦圆点可查看具体数值。</p>
      {rows.length ? <ChartContainer ref={plot} config={config} className="relative h-[420px] min-h-[420px] w-full aspect-auto" role="group" aria-label={`双方玩家${basis}升序对比`} aria-describedby={descriptionId} onPointerLeave={dismiss} overlay={point && active ? <div id={tooltipId} role="tooltip" className="absolute z-20 max-w-[calc(100%-1rem)]" style={{ left: Math.max(0, Math.min((plot.current?.clientWidth ?? 320) - 220, active.x)), top: active.y < 100 ? active.y + 14 : active.y - 95 }} onPointerEnter={cancelDismiss} onPointerLeave={dismiss}><ChartTooltipContent active label={settings.showNames ? point.player.name : `${teamNames[point.team]}第 ${point.rank} 位`} payload={[{ graphicalItemId: point.team, dataKey: point.team, name: point.team, value: point.rate, color: `var(--${point.team})` }]} formatter={() => <div className="grid min-w-40 gap-2"><span className="text-muted-foreground">{point.player.ship.name}</span><div className="flex justify-between gap-4"><span>{teamNames[point.team]} · 第 {point.rank} / {data.counts[point.team]} 位</span><strong className={`text-${point.team} tabular-nums`}>{formatPercent(point.rate)}</strong></div></div>} /></div> : null}>
        {chart}
      </ChartContainer> : <EmptyState icon={<Icon icon={faChartLine} size={28} />} title="尚无公开战绩">取得公开战绩后，这里将按胜率从低到高展示双方玩家。</EmptyState>}
    </CardContent>
  </Card>
}
