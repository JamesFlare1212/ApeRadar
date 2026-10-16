import { describe, expect, it } from 'vitest'
import { generateOutput, kde, playerRate, skillLevel, teamSummary, weightedWinrate } from '@aperadar/shared/statistics'
import { settings, demo, fixturePlayer } from './helpers.js'
import { settingsSchema } from '@aperadar/shared/settings'

describe('historically verified rating semantics', () => {
  it('weights per-mode battles before the capped ship mixture', () => {
    const player = fixturePlayer(), config = settings()
    expect(weightedWinrate(player, config)).toBeCloseTo(.5298181818181819, 12)
    player.stats.ship = { ...player.stats.ship, battles: 60, wins: 42 }
    expect(weightedWinrate(player, config)).toBeCloseTo(.5487272727272727, 12)
    player.stats.ship = { ...player.stats.ship, battles: 600, wins: 420 }
    expect(weightedWinrate(player, config)).toBeCloseTo(.5487272727272727, 12)
  })
  it('uses account total at zero ship battles, not the solo-weighted baseline', () => { const player = fixturePlayer(); player.stats.ship.battles = 0; expect(weightedWinrate(player, settings())).toBeCloseTo(690 / 1300, 12) })
  it('avoids NaN when all of the player’s modes have zero effective weight', () => {
    const player = fixturePlayer(), config = settings(); config.weights = { ...config.weights, solo: 0, div2: 0, div3: 1 }; player.stats.div3.battles = 0
    expect(weightedWinrate(player, config)).toBeCloseTo(690 / 1300, 12)
  })
  it('handles a zero saturation threshold without division by zero', () => { const config = settings(); config.weights.shipBattles = 0; expect(weightedWinrate(fixturePlayer(), config)).toBeCloseTo(.5487272727272727, 12) })
  it('preserves inclusive low and strict elite boundaries with minimum battles', () => {
    const player = fixturePlayer(), config = settings(); player.stats.overall = { ...player.stats.overall, battles: 500, wins: 235 }
    expect(skillLevel(player, config)).toBe('low')
    player.stats.overall.wins = 290; expect(skillLevel(player, config)).not.toBe('elite')
    player.stats.overall.wins = 291; expect(skillLevel(player, config)).toBe('elite')
    player.stats.overall.battles = 499; expect(skillLevel(player, config)).not.toBe('elite')
  })
  it('excludes missing and hidden players, and uses an account-equal team mean', () => {
    const battle = demo(), config = settings(), first = fixturePlayer(), second = fixturePlayer()
    first.stats.overall = { battles: 100, wins: 60, xp: null, damage: null }; second.stats.overall = { battles: 10000, wins: 4000, xp: null, damage: null }
    battle.players = [first, { ...second, key: 'second' }, { ...first, key: 'hidden', status: 'hidden', stats: null }, { ...second, key: 'failed', status: 'unavailable', stats: null }]
    expect(teamSummary(battle, 'ally', config).accountWinrate).toBe(.5)
    expect(teamSummary(battle, 'ally', config).valid).toBe(2)
    expect(teamSummary(battle, 'enemy', config).winrate).toBeNull()
    expect(playerRate({ ...first, status: 'hidden' }, config)).toBeNull()
  })
  it('retains zero as a valid actual result, and provides a finite density curve', () => {
    const player = fixturePlayer(); player.stats.overall.battles = 0; player.stats.overall.wins = 0
    expect(playerRate(player, settings())).toBe(0)
    expect(kde([.5, .5]).every(p => Number.isFinite(p.y))).toBe(true)
    expect(kde([])).toEqual([])
  })
  it('does not leak names in generated output when privacy is enabled', () => {
    const battle = demo(), config = settings(); config.showNames = false
    const output = generateOutput(battle, config)
    expect(battle.players.some(p => output.includes(p.name))).toBe(false)
    expect(output).toContain('我方上等马')
  })
  it('rejects non-finite and overlapping thresholds in settings', () => {
    expect(settingsSchema.safeParse({ ...settings(), apeThreshold: NaN }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...settings(), apeThreshold: 70, unicumThreshold: 50 }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...settings(), weights: { ...settings().weights, solo: 0, div2: 0, div3: 0 } }).success).toBe(false)
  })
})
