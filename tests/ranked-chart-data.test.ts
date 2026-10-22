import { describe, expect, it } from 'vitest'
import { buildRankedWinrateChart } from '@aperadar/shared/winrate-chart'
import { rankedChartRows } from '../apps/web/src/lib/rankedChartData.js'
import { demo, settings } from './helpers.js'

describe('Recharts ranked team data', () => {
  it('returns no chart rows when neither team has public statistics', () => {
    expect(rankedChartRows({ ally: [], enemy: [] })).toEqual([])
  })

  it('retains each team’s numeric positions when their public sample counts differ', () => {
    const battle = demo()
    const ally = battle.players.filter(player => player.team === 'ally' && player.status === 'ready').slice(0, 4)
    const enemy = battle.players.filter(player => player.team === 'enemy' && player.status === 'ready').slice(0, 3)
    const chart = buildRankedWinrateChart({ ...battle, players: [...ally, ...enemy] }, settings())
    const rows = rankedChartRows(chart)
    expect(rows.map(row => row.position)).toEqual([0, 1 / 3, .5, 2 / 3, 1])
    expect(rows.filter(row => row.allyPoint).map(row => row.position)).toEqual([0, 1 / 3, 2 / 3, 1])
    expect(rows.filter(row => row.enemyPoint).map(row => row.position)).toEqual([0, .5, 1])
    expect(rows.find(row => row.position === .5)?.ally).toBeUndefined()
  })

  it('keeps real zero values and both player identities at a shared position', () => {
    const players = demo().players.filter(player => player.status === 'ready')
    const ally = { player: players[0], rate: 0, position: .5 }
    const enemy = { player: players[1], rate: .5, position: .5 }
    const rows = rankedChartRows({ ally: [ally], enemy: [enemy] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ position: .5, ally: 0, enemy: .5, allyPoint: { rank: 1, team: 'ally' }, enemyPoint: { rank: 1, team: 'enemy' } })
    expect(rows[0].allyPoint?.player).toBe(ally.player)
    expect(rows[0].enemyPoint?.player).toBe(enemy.player)
  })

  it('does not mutate ranked entries or fabricate values for missing team samples', () => {
    const chart = buildRankedWinrateChart(demo(), settings())
    const before = structuredClone(chart)
    for (const entries of [chart.ally, chart.enemy]) {
      entries.forEach(Object.freeze)
      Object.freeze(entries)
    }
    const rows = rankedChartRows(chart)
    for (const team of ['ally', 'enemy'] as const) {
      expect(rows.filter(row => row[`${team}Point`]).map(row => row[team])).toEqual(chart[team].map(entry => entry.rate))
      expect(rows.filter(row => row[`${team}Point`]).map(row => row[`${team}Point`]?.rank)).toEqual(chart[team].map((_, index) => index + 1))
    }
    expect(chart).toEqual(before)
  })
})
