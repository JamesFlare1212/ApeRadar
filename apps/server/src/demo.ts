import type { Battle, CombatStats, PlayerStats, RadarPlayer } from '@aperadar/shared/types'
import { getShip, type ShipCatalog } from './arena.ts'

const names = ['Northbound', 'Quiet_Current', 'HarborFox', 'SilverWake', 'OceanPulse', 'PolarAtlas', 'Midnight_Wave', 'Cobalt_Ray', 'EchoOfTides', 'FrostHelm', 'CedarAnchor', 'BlueOrbit', 'CoralPilot', 'Waveborne', 'AsterFleet', 'HorizonLine', 'SeaLantern', 'CopperFin', 'WinterSail', 'DeltaSkipper', 'CloudHarbor', 'AmberWatch', 'TidalSpark', 'DeepCompass']
const ships = ['Yamato', 'Montana', 'Des Moines', 'Stalingrad', 'Shimakaze', 'Daring', 'Midway', 'Bourgogne', 'Hindenburg', 'Halland', 'Venezia', 'Balao']
function combat(battles: number, rate: number, damage: number, xp: number): CombatStats { return { battles, wins: Math.round(battles * rate), damage: battles * damage, xp: battles * xp } }
export function createDemo(catalog: ShipCatalog): Battle {
  const all = Object.entries(catalog.ships)
  const rates = [.632, .587, .554, .524, .496, .459, .571, .613, .511, .473, .535, .482, .573, .621, .541, .509, .466, .487, .563, .522, .442, .598, .501, .518]
  const players: RadarPlayer[] = names.map((name, i) => {
    const requested = ships[i % ships.length]
    const found = all.find(([, ship]) => ship['name_en-us'] === requested && ship.tier >= 9) ?? all.find(([, ship]) => ship['name_en-us'].includes(requested)) ?? all[(i * 7) % all.length]
    const ship = getShip(catalog, found[0])
    const battles = 2200 + (i * 773) % 16000
    const solo = combat(Math.floor(battles * .68), rates[i] - .012, 68200 + i * 1350, 1430 + i * 38)
    const div2 = combat(Math.floor(battles * .21), rates[i] + .013, 72000, 1700)
    const div3 = combat(battles - solo.battles - div2.battles, rates[i] + .038, 75000, 1800)
    const stats: PlayerStats = { shipAvailable: true, overall: { battles, wins: solo.wins + div2.wins + div3.wins, damage: null, xp: battles * (1400 + i * 37) }, solo, div2, div3, ship: combat(40 + i * 23, rates[i] + .018, 62000 + ((i * 7733) % 70000), 1600 + i * 40), shipSolo: combat(30 + i * 16, rates[i], 63000, 1500), shipDiv2: combat(6 + i * 4, rates[i] + .02, 72000, 1700), shipDiv3: combat(4 + i * 3, rates[i] + .04, 75000, 1800), karma: 12 + i * 7 }
    const hidden = i === 11 || i === 20
    return { key: `ASIA:demo-${i}:${ship.id}`, accountId: `demo-${1000 + i}`, name, region: 'ASIA', team: i < 12 ? 'ally' : 'enemy', isSelf: i === 0, ship, clanTag: i % 4 !== 2 ? ['NORTH', 'TIDE', 'SEA', 'WAVE'][i % 4] : '', clanId: null, status: hidden ? 'hidden' : 'ready', stats: hidden ? null : stats, error: null, fetchedAt: new Date().toISOString(), cached: false }
  })
  return { id: 'demo-northern-waters', sourceName: '演示阵容 · 合成数据', isDemo: true, importedAt: new Date().toISOString(), startedAt: new Date(Date.now() - 4 * 60000).toISOString(), mode: 'pvp', map: '北方水域', players }
}
