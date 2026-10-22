import { describe, expect, it } from 'vitest'
import { playerRate } from '@aperadar/shared/statistics'
import { buildRankedWinrateChart, monotoneLinePath } from '@aperadar/shared/winrate-chart'
import type { ChartPoint } from '@aperadar/shared/winrate-chart'
import type { Battle, RadarPlayer, Team } from '@aperadar/shared/types'
import { demo, fixturePlayer, settings } from './helpers.js'

function player(key: string, rate: number, team: Team = 'ally'): RadarPlayer {
  const entry = fixturePlayer()
  entry.key = key
  entry.name = `Captain ${key}`
  entry.team = team
  entry.stats.overall = { ...entry.stats.overall, battles: 1000, wins: rate * 1000 }
  return entry
}
function battle(players: RadarPlayer[]): Battle { return { ...demo(), players } }

describe('ranked winrate chart', () => {
  it('sorts copies of each team, retaining player identity and stable ties without changing roster order', () => {
    const roster = battle([player('high', .6), player('enemy', .55, 'enemy'), player('low', .4), player('tie', .6)])
    const before = structuredClone(roster)
    Object.freeze(roster.players)
    const chart = buildRankedWinrateChart(roster, settings())
    expect(chart.ally.map(entry => entry.player.key)).toEqual(['low', 'high', 'tie'])
    expect(chart.ally.map(entry => entry.player.name)).toEqual(['Captain low', 'Captain high', 'Captain tie'])
    expect(chart.ally[0].player).toBe(roster.players[2])
    expect(chart.ally[0].player.ship).toBe(roster.players[2].ship)
    expect(roster).toEqual(before)
  })

  it('uses the full chart width independently for teams with different valid sample counts', () => {
    const chart = buildRankedWinrateChart(battle([
      player('a', .4), player('b', .5), player('c', .6), player('d', .45, 'enemy'), player('e', .55, 'enemy'),
    ]), settings())
    expect(chart.ally.map(entry => entry.position)).toEqual([0, .5, 1])
    expect(chart.enemy.map(entry => entry.position)).toEqual([0, 1])
    expect(chart.counts).toEqual({ ally: 3, enemy: 2 })
  })

  it('retains real zero winrates and omits hidden, unavailable, pending, bot and missing stats', () => {
    const excluded = ['hidden', 'unavailable', 'not-found', 'pending', 'bot'].map(status => ({
      ...player(status, .6), status: status as RadarPlayer['status'],
    }))
    const chart = buildRankedWinrateChart(battle([
      player('zero', 0), ...excluded, { ...player('missing', .6), stats: null }, player('invalid', NaN),
    ]), settings())
    expect(chart.ally.map(entry => [entry.player.key, entry.rate, entry.position])).toEqual([['zero', 0, .5]])
    expect(chart.counts).toEqual({ ally: 1, enemy: 0 })
    expect(chart.min).toBe(0)
  })

  it('handles empty and wholly unavailable battles with a finite default axis', () => {
    for (const players of [[], [{ ...player('hidden', .6), status: 'hidden' as const }]]) {
      expect(buildRankedWinrateChart(battle(players), settings())).toEqual({
        ally: [], enemy: [], counts: { ally: 0, enemy: 0 }, min: .3, max: .7, ticks: [.3, .35, .4, .45, .5, .55, .6, .65, .7],
      })
    }
  })

  it('keeps constant winrates as separate points at their actual value', () => {
    const chart = buildRankedWinrateChart(battle([player('a', .5), player('b', .5), player('c', .5)]), settings())
    expect(chart.ally.map(entry => entry.rate)).toEqual([.5, .5, .5])
    expect(chart.ally.map(entry => entry.position)).toEqual([0, .5, 1])
  })

  it('uses the selected account or weighted rating mode', () => {
    const entry = fixturePlayer(), config = settings(), roster = battle([entry])
    config.winrate = 'account'
    const account = buildRankedWinrateChart(roster, config).ally[0].rate
    expect(account).toBeCloseTo(690 / 1300)
    config.winrate = 'weighted'
    const weighted = buildRankedWinrateChart(roster, config).ally[0].rate
    expect(weighted).toBe(playerRate(entry, config))
    expect(weighted).not.toBe(account)
  })

  it.each([
    [[.31, .69], .3, .7], [[.29, .71], .25, .75], [[0, 1], 0, 1], [[.2, .86], .2, .9],
    [[.4577, .6309], .45, .65], [[.45, .65], .45, .65], [[.49, .51], .4, .6], [[.5, .5], .4, .6], [[0, 0], 0, .2], [[1, 1], .8, 1],
  ])('fits the percentage axis to %j with five-point ticks and a safe minimum span', (rates, min, max) => {
    const chart = buildRankedWinrateChart(battle(rates.map((rate, index) => player(`${index}`, rate))), settings())
    expect(chart.min).toBe(min)
    expect(chart.max).toBe(max)
    expect(chart.max - chart.min).toBeGreaterThanOrEqual(.2 - Number.EPSILON)
    expect(chart.ticks[0]).toBe(min)
    expect(chart.ticks.at(-1)).toBe(max)
    expect(chart.ticks.every(tick => Number.isFinite(tick) && tick >= 0 && tick <= 1)).toBe(true)
    chart.ticks.slice(1).forEach((tick, index) => expect(tick - chart.ticks[index]).toBeCloseTo(.05))
    expect(rates.every(rate => chart.min <= rate && rate <= chart.max)).toBe(true)
  })
})

describe('monotone SVG curves', () => {
  it('handles zero, one and two points without fabricating samples', () => {
    expect(monotoneLinePath([])).toBe('')
    expect(monotoneLinePath([{ x: 50, y: 40 }])).toBe('M50,40')
    expect(monotoneLinePath([{ x: 0, y: 10 }, { x: 100, y: 20 }])).toBe('M0,10 L100,20')
  })

  it('falls back safely for repeated x coordinates and filters non-finite coordinates', () => {
    expect(monotoneLinePath([{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 3 }])).toBe('M0,1 L0,2 L1,3')
    expect(monotoneLinePath([{ x: NaN, y: 2 }, { x: 1, y: 3 }])).toBe('M1,3')
  })

  it.each([
    [300, 299, 299, 20, 20, 0],
    [0, 0, 1, 200, 201, 201],
    [50, 50, 50, 50, 50, 50],
  ])('keeps every interpolated step inside its actual endpoints: %j', (...ys) => {
    const points: ChartPoint[] = ys.map((y, index) => ({ x: [0, 2, 20, 21, 80, 100][index], y }))
    const before = structuredClone(points)
    const path = monotoneLinePath(points)
    const segments = [...path.matchAll(/C([^C]+)/g)]
    expect(segments).toHaveLength(points.length - 1)
    segments.forEach((segment, index) => {
      const coordinates = segment[1].trim().split(/[ ,]+/).map(Number)
      expect(coordinates.every(Number.isFinite)).toBe(true)
      const from = points[index], to = points[index + 1]
      for (let step = 0; step <= 100; step++) {
        const t = step / 100, u = 1 - t
        const y = u ** 3 * from.y + 3 * u ** 2 * t * coordinates[1] + 3 * u * t ** 2 * coordinates[3] + t ** 3 * to.y
        expect(y).toBeGreaterThanOrEqual(Math.min(from.y, to.y) - 1e-9)
        expect(y).toBeLessThanOrEqual(Math.max(from.y, to.y) + 1e-9)
      }
      expect(coordinates.slice(-2)).toEqual([to.x, to.y])
    })
    expect(points).toEqual(before)
  })
})
