import type { Battle, CombatStats, RadarPlayer, Settings, Team } from './types.ts'

export const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)
export function winrate(stats: CombatStats | undefined | null): number | null {
  if (!stats || stats.battles < 0 || !finite(stats.battles) || !finite(stats.wins)) return null
  return stats.battles === 0 ? 0 : Math.min(1, Math.max(0, stats.wins / stats.battles))
}
export function weightedWinrate(player: RadarPlayer, settings: Settings): number | null {
  const s = player.stats
  if (!s || player.status !== 'ready') return null
  const account = winrate(s.overall)
  if (!s.shipAvailable || s.ship.battles === 0) return account
  const modes = [s.solo, s.div2, s.div3]
  const multipliers = [settings.weights.solo, settings.weights.div2, settings.weights.div3]
  const denominator = modes.reduce((sum, mode, i) => sum + mode.battles * multipliers[i], 0)
  if (denominator <= 0) return account
  const a = modes.reduce((sum, mode, i) => sum + (winrate(mode) ?? 0) * mode.battles * multipliers[i], 0) / denominator
  const weight = (settings.weights.shipBattles === 0 ? 1 : Math.min(s.ship.battles / settings.weights.shipBattles, 1)) * settings.weights.shipMax / 100
  const result = a * (1 - weight) + (winrate(s.ship) ?? account ?? 0) * weight
  return finite(result) ? result : account
}
export function playerRate(player: RadarPlayer, settings: Settings): number | null {
  return player.status === 'ready' ? (settings.winrate === 'weighted' ? weightedWinrate(player, settings) : winrate(player.stats?.overall)) : null
}
export type SkillLevel = 'elite' | 'strong' | 'average' | 'low' | 'unknown'
export function skillLevel(player: RadarPlayer, settings: Settings): SkillLevel {
  const rate = playerRate(player, settings)
  if (rate === null) return 'unknown'
  const battles = player.stats?.overall.battles ?? 0
  if (rate <= settings.apeThreshold / 100 && battles >= settings.minApeBattles) return 'low'
  if (rate > settings.unicumThreshold / 100 && battles >= settings.minUnicumBattles) return 'elite'
  return rate >= .54 ? 'strong' : 'average'
}
export const SKILL_LABELS: Record<SkillLevel, string> = { elite: '精英', strong: '熟练', average: '标准', low: '海猴', unknown: '暂无数据' }
export function teamSummary(battle: Battle, team: Team, settings: Settings) {
  const players = battle.players.filter(p => p.team === team)
  const valid = players.filter(p => p.status === 'ready' && winrate(p.stats?.overall) !== null)
  const mean = (values: (number | null)[]) => {
    const numbers = values.filter(finite)
    return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null
  }
  return {
    players: players.length, valid: valid.length,
    winrate: mean(valid.map(p => playerRate(p, settings))),
    accountWinrate: mean(valid.map(p => winrate(p.stats?.overall))),
    weightedWinrate: mean(valid.map(p => weightedWinrate(p, settings))),
    battles: mean(valid.map(p => p.stats?.overall.battles ?? null)),
    elite: players.filter(p => skillLevel(p, settings) === 'elite').length,
    low: players.filter(p => skillLevel(p, settings) === 'low').length,
    hidden: players.filter(p => p.status === 'hidden').length,
    unavailable: players.filter(p => ['unavailable', 'not-found'].includes(p.status)).length,
  }
}
export function kde(values: number[], min = .3, max = .8, steps = 80) {
  const data = values.filter(finite)
  if (!data.length) return []
  const sigma = .025
  return Array.from({ length: steps }, (_, i) => {
    const x = min + (max - min) * i / (steps - 1)
    const y = data.reduce((sum, value) => sum + Math.exp(-((value - x) ** 2) / (2 * sigma ** 2)), 0) / (data.length * sigma * Math.sqrt(2 * Math.PI))
    return { x, y }
  })
}
export function generateOutput(battle: Battle, settings: Settings): string {
  const replacements: Record<string, string> = {}
  for (const [team, prefix] of [['ally', 'Ally'], ['enemy', 'Enemy']] as const) {
    const players = battle.players.filter(p => p.team === team && (!settings.excludeSelf || !p.isSelf))
    const name = (p: RadarPlayer) => settings.showNames ? `${p.ship.name}(${p.name})` : p.ship.name
    replacements[`${prefix}UnicumList`] = players.filter(p => skillLevel(p, settings) === 'elite').map(name).join('、') || '无'
    replacements[`${prefix}ApeList`] = players.filter(p => skillLevel(p, settings) === 'low').map(name).join('、') || '无'
    replacements[`${prefix}HiddenList`] = players.filter(p => p.status === 'hidden').map(name).join('、') || '无'
    const summary = teamSummary(battle, team, settings)
    replacements[`${prefix}AvgAccountWinrate`] = summary.accountWinrate === null ? '—' : `${(summary.accountWinrate * 100).toFixed(2)}%`
    replacements[`${prefix}AvgWeightedWinrate`] = summary.weightedWinrate === null ? '—' : `${(summary.weightedWinrate * 100).toFixed(2)}%`
  }
  return settings.textTemplate.replace(/\{([A-Za-z]+)\}/g, (match, key: string) => replacements[key] ?? match)
}
export function formatPercent(n: number | null, digits = 2) { return finite(n) ? `${(n * 100).toFixed(digits)}%` : '—' }
export function formatNumber(n: number | null | undefined) { return finite(n) ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(n) : '—' }
