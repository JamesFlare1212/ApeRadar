import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { CombatStats, PlayerStats, Settings } from '@aperadar/shared/types'
import { DEFAULT_SETTINGS } from '@aperadar/shared/settings'
import { createDemo } from '@aperadar/server/demo'
import type { ShipCatalog } from '@aperadar/server/arena'

export const catalog = JSON.parse(readFileSync(new URL('../apps/server/resources/ships.json', import.meta.url), 'utf8')) as ShipCatalog
export const settings = (): Settings => structuredClone(DEFAULT_SETTINGS)
export const demo = () => createDemo(catalog)
const combat = (battles: number, wins: number): CombatStats => ({ battles, wins, damage: 12000 * battles, xp: 1000 * battles })
export function fixturePlayer() {
  const player = demo().players[0]
  const stats: PlayerStats = { overall: combat(1300, 690), solo: combat(1000, 500), div2: combat(200, 120), div3: combat(100, 70), ship: combat(30, 21), shipSolo: combat(20, 13), shipDiv2: combat(8, 6), shipDiv3: combat(2, 2), karma: 22, shipAvailable: true }
  return { ...player, status: 'ready' as const, accountId: '42', stats }
}
export function arena(name = 'TestCaptain', time = '16.10.2026 12:00:00') {
  return { matchGroup: 'pvp', mapName: '测试海域', dateTime: time, vehicles: [{ id: 42, name, relation: 0, shipId: Object.keys(catalog.ships)[0] }] }
}
export function tempDirectory() {
  const root = path.resolve('.test-data')
  mkdirSync(root, { recursive: true })
  return mkdtempSync(path.join(root, 'unit-'))
}
export function removeTemp(directory: string) {
  const root = path.resolve('.test-data')
  const target = path.resolve(directory)
  if (!target.startsWith(root + path.sep)) throw new Error('Refusing cleanup outside test workspace')
  rmSync(target, { recursive: true, force: true })
}
