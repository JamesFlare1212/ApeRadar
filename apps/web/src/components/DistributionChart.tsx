import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { faChartLine } from '@fortawesome/free-solid-svg-icons'
import { Icon } from './Icon.js'
import type { Battle, Settings, Team } from '@aperadar/shared/types'
import { formatPercent } from '@aperadar/shared/statistics'
import { buildRankedWinrateChart, monotoneLinePath } from '@aperadar/shared/winrate-chart'

const HEIGHT = 300
const LEFT = 58, RIGHT = 14, TOP = 14, BOTTOM = 34
const teamNames: Record<Team, string> = { ally: '我方', enemy: '敌方' }

export function DistributionChart({ battle, settings }: { battle: Battle; settings: Settings }) {
  const id = useId().replace(/:/g, '')
  const plot = useRef<HTMLDivElement>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [width, setWidth] = useState(800)
  const [active, setActive] = useState<{ team: Team; key: string } | null>(null)
  const data = useMemo(() => buildRankedWinrateChart(battle, settings), [battle, settings])
  const hasData = data.counts.ally + data.counts.enemy > 0
  const basis = settings.winrate === 'account' ? '账号胜率' : '加权胜率'
  const cancelDismiss = () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); dismissTimer.current = null }
  const showPoint = (team: Team, key: string) => { cancelDismiss(); setActive({ team, key }) }
  const dismissPoint = () => {
    cancelDismiss()
    if (plot.current?.contains(document.activeElement) && document.activeElement?.matches('.winrate-point')) return
    dismissTimer.current = setTimeout(() => setActive(null), 150)
  }
  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }, [])

  useEffect(() => {
    const element = plot.current
    if (!element) return
    const measure = () => setWidth(Math.max(1, Math.round(element.getBoundingClientRect().width)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasData])

  const y = (rate: number) => TOP + (data.max - rate) / (data.max - data.min) * (HEIGHT - TOP - BOTTOM)
  const series = (['ally', 'enemy'] as const).map(team => ({
    team,
    points: data[team].map((entry, index) => ({ ...entry, team, rank: index + 1, x: LEFT + entry.position * Math.max(1, width - LEFT - RIGHT), y: y(entry.rate) })),
  }))
  const selected = series.flatMap(line => line.points).find(point => point.team === active?.team && point.player.key === active.key)
  const pointLabel = (point: typeof series[number]['points'][number]) => `${teamNames[point.team]}，队内升序第 ${point.rank} / ${data.counts[point.team]} 位，${settings.showNames ? `${point.player.name}，` : ''}${point.player.ship.name}，${basis} ${formatPercent(point.rate)}`

  return <section className="panel distribution-panel">
    <div className="panel-heading">
      <div><h2><Icon icon={faChartLine} size={19} />胜率分布</h2><p>{basis} · 双方各自从低到高</p></div>
      <div className="chart-legend">{(['ally', 'enemy'] as const).map(team => <span key={team}><i className={`${team}-dot`} />{teamNames[team]} <b>{data.counts[team]} 人</b></span>)}</div>
    </div>
    {hasData ? <div ref={plot} className="ranked-winrate-chart">
      <svg className="ranked-winrate-svg" viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} role="group" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>双方玩家{basis}升序对比</title>
        <desc id={`${id}-desc`}>纵轴为{basis}，双方分别按胜率从低到高排列，横向位置表示队内相对顺序。每个圆点代表一位玩家，我方 {data.counts.ally} 人，敌方 {data.counts.enemy} 人。隐藏或未取得的战绩不计入。悬停或聚焦圆点可查看具体数值。</desc>
        <g className="winrate-grid" aria-hidden="true">{data.ticks.map(tick => <g key={tick}>
          <line x1={LEFT} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} />
          <text x={LEFT - 12} y={y(tick)} textAnchor="end" dominantBaseline="middle">{formatPercent(tick, 1)}</text>
        </g>)}</g>
        {series.map(line => <g key={line.team} role="group" aria-label={`${teamNames[line.team]} ${line.points.length} 人`}>
          {line.points.length > 1 && <path className={`winrate-line winrate-line-${line.team}`} d={monotoneLinePath(line.points)} aria-hidden="true" />}
          {line.points.map(point => {
            const isActive = selected === point
            return <circle key={point.player.key} className={`winrate-point winrate-point-${line.team}`} cx={point.x} cy={point.y} r={isActive ? 6 : 4.5} tabIndex={0} role="img" aria-label={pointLabel(point)} aria-describedby={isActive ? `${id}-tooltip` : undefined} data-team={line.team} data-rank={point.rank} data-rate={point.rate}
              onPointerEnter={() => showPoint(line.team, point.player.key)}
              onPointerLeave={dismissPoint}
              onFocus={() => showPoint(line.team, point.player.key)}
              onBlur={dismissPoint}
              onClick={() => showPoint(line.team, point.player.key)}
              onKeyDown={event => { if (event.key === 'Escape') { cancelDismiss(); setActive(null) } }} />
          })}
        </g>)}
        <g className="winrate-x-labels" aria-hidden="true">
          <text x={LEFT} y={HEIGHT - 8}>低胜率</text>
          <text x={(LEFT + width - RIGHT) / 2} y={HEIGHT - 8} textAnchor="middle">队内相对顺序</text>
          <text x={width - RIGHT} y={HEIGHT - 8} textAnchor="end">高胜率</text>
        </g>
      </svg>
      {selected && <div id={`${id}-tooltip`} role="tooltip" className="winrate-tooltip" data-below={selected.y < 100} onPointerEnter={cancelDismiss} onPointerLeave={dismissPoint} style={{ left: Math.max(100, Math.min(width - 100, selected.x)), top: selected.y < 100 ? selected.y + 12 : selected.y - 12 }}>
        <strong>{settings.showNames ? selected.player.name : `${teamNames[selected.team]}第 ${selected.rank} 位`}</strong>
        <span>{selected.player.ship.name}</span>
        <div><span>{teamNames[selected.team]} · 第 {selected.rank} / {data.counts[selected.team]} 位</span><b className={`text-${selected.team}`}>{formatPercent(selected.rate)}</b></div>
      </div>}
    </div> : <div className="chart-empty">取得公开战绩后，这里将按胜率从低到高展示双方玩家。</div>}
  </section>
}
