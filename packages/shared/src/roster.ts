import type { RadarPlayer, ShipType } from './types.ts'

const classOrder: Record<ShipType, number> = {
  AirCarrier: 0, Battleship: 1, Cruiser: 2, Destroyer: 3, Submarine: 4, Unknown: 5,
}

// Nation order follows the game's internal nation codes, rather than translated names.
const nationOrder = ['usa', 'uk', 'france', 'germany', 'netherlands', 'italy', 'japan', 'ussr', 'spain', 'commonwealth', 'pan_america', 'europe', 'pan_asia']
function nationRank(nation: string): number {
  const rank = nationOrder.indexOf(nation)
  return rank < 0 ? nationOrder.length : rank
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function sortRosterPlayers(players: readonly RadarPlayer[]): RadarPlayer[] {
  // Sort a display copy; imported snapshots and statistics/chart order remain independent.
  // Reference: https://github.com/anmonite/wows-stats-plus/blob/master/static/js/app.js
  return [...players].sort((left, right) => {
    const shipOrder = classOrder[left.ship.type] - classOrder[right.ship.type]
      || right.ship.tier - left.ship.tier
      || nationRank(left.ship.nation) - nationRank(right.ship.nation)
    if (shipOrder) return shipOrder

    if (left.ship.id !== right.ship.id) {
      const leftNumeric = /^\d+$/.test(left.ship.id), rightNumeric = /^\d+$/.test(right.ship.id)
      if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
      if (leftNumeric && rightNumeric) {
        const leftId = BigInt(left.ship.id), rightId = BigInt(right.ship.id)
        if (leftId !== rightId) return leftId > rightId ? -1 : 1
      } else {
        return compareText(right.ship.id, left.ship.id)
      }
    }
    // Account/clan lookup, hidden statistics, and win-rate settings cannot move a row.
    return compareText(left.name.toLowerCase(), right.name.toLowerCase())
  })
}
