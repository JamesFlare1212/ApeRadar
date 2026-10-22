import { finite, playerRate } from './statistics.ts'
import type { Battle, RadarPlayer, Settings } from './types.ts'

export interface RankedWinrateEntry {
  player: RadarPlayer
  rate: number
  position: number
}

export function buildRankedWinrateChart(battle: Battle, settings: Settings) {
  const teams: Record<'ally' | 'enemy', RankedWinrateEntry[]> = { ally: [], enemy: [] }
  for (const player of battle.players) {
    const rate = playerRate(player, settings)
    if (finite(rate)) teams[player.team].push({ player, rate, position: 0 })
  }
  for (const entries of Object.values(teams)) {
    entries.sort((a, b) => a.rate - b.rate)
    entries.forEach((entry, index) => { entry.position = entries.length === 1 ? .5 : index / (entries.length - 1) })
  }
  // Fit both teams to five-point bounds, with a twenty-point minimum span for flat samples.
  const rates = [...teams.ally, ...teams.enemy].map(entry => entry.rate)
  const stepsPerUnit = 20
  const minimumSpanSteps = 4
  let low = Math.max(0, Math.min(stepsPerUnit, Math.floor((rates.length ? Math.min(...rates) : .3) * stepsPerUnit)))
  let high = Math.max(0, Math.min(stepsPerUnit, Math.ceil((rates.length ? Math.max(...rates) : .7) * stepsPerUnit)))
  while (high - low < minimumSpanSteps) {
    if (low > 0) low--
    if (high - low < minimumSpanSteps && high < stepsPerUnit) high++
  }
  return {
    ...teams,
    counts: { ally: teams.ally.length, enemy: teams.enemy.length },
    min: low / stepsPerUnit,
    max: high / stepsPerUnit,
    ticks: Array.from({ length: high - low + 1 }, (_, index) => (low + index) / stepsPerUnit),
  }
}

export interface ChartPoint { x: number; y: number }

/** Shape-preserving cubic interpolation; each segment stays between its endpoint values. */
export function monotoneLinePath(points: readonly ChartPoint[]): string {
  const data = points.filter(point => finite(point.x) && finite(point.y))
  if (!data.length) return ''
  const start = `M${data[0].x},${data[0].y}`
  const polyline = () => start + data.slice(1).map(point => ` L${point.x},${point.y}`).join('')
  if (data.length < 3) return polyline()

  const widths = data.slice(1).map((point, index) => point.x - data[index].x)
  if (widths.some(width => width <= 0 || !finite(width))) return polyline()
  const slopes = widths.map((width, index) => (data[index + 1].y - data[index].y) / width)
  if (slopes.some(slope => !finite(slope))) return polyline()
  const tangents = data.map((_, index) => {
    if (index === 0) return slopes[0]
    if (index === data.length - 1) return slopes[index - 1]
    const previous = slopes[index - 1], next = slopes[index]
    if (previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)) return 0
    const a = 2 * widths[index] + widths[index - 1]
    const b = widths[index] + 2 * widths[index - 1]
    return (a + b) / (a / previous + b / next)
  })
  // Fritsch–Carlson limiter also protects abrupt steps next to flat segments.
  slopes.forEach((slope, index) => {
    if (slope === 0) {
      tangents[index] = 0
      tangents[index + 1] = 0
      return
    }
    const a = tangents[index] / slope, b = tangents[index + 1] / slope
    const magnitude = Math.hypot(a, b)
    if (magnitude > 3) {
      tangents[index] = 3 * a * slope / magnitude
      tangents[index + 1] = 3 * b * slope / magnitude
    }
  })
  return start + widths.map((width, index) => {
    const from = data[index], to = data[index + 1], third = width / 3
    return ` C${from.x + third},${from.y + third * tangents[index]} ${to.x - third},${to.y - third * tangents[index + 1]} ${to.x},${to.y}`
  }).join('')
}
