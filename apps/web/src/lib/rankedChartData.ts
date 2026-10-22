import type { buildRankedWinrateChart, RankedWinrateEntry } from '@aperadar/shared/winrate-chart'
import type { Team } from '@aperadar/shared/types'

export interface RankedChartPoint extends RankedWinrateEntry { team: Team; rank: number }
export interface RankedChartRow {
  position: number
  ally?: number
  enemy?: number
  allyPoint?: RankedChartPoint
  enemyPoint?: RankedChartPoint
}

// Recharts shares one numeric axis while each team's samples retain their own positions.
export function rankedChartRows(chart: Pick<ReturnType<typeof buildRankedWinrateChart>, 'ally' | 'enemy'>): RankedChartRow[] {
  const rows = new Map<number, RankedChartRow>()
  for (const team of ['ally', 'enemy'] as const) {
    chart[team].forEach((entry, index) => {
      const row = rows.get(entry.position) ?? { position: entry.position }
      row[team] = entry.rate
      row[`${team}Point`] = { ...entry, team, rank: index + 1 }
      rows.set(entry.position, row)
    })
  }
  return [...rows.values()].sort((left, right) => left.position - right.position)
}
