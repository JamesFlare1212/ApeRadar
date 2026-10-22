import { describe, expect, it } from 'vitest'
import type { RadarPlayer, Ship, ShipType } from '@aperadar/shared/types'
import { sortRosterPlayers } from '@aperadar/shared/roster'
import { fixturePlayer } from './helpers.js'

function player(name: string, ship: Partial<Ship> = {}): RadarPlayer {
  const base = fixturePlayer()
  return { ...base, key: name, name, ship: { ...base.ship, id: '100', type: 'Battleship', tier: 10, nation: 'usa', ...ship } }
}
const names = (players: readonly RadarPlayer[]) => sortRosterPlayers(players).map(entry => entry.name)

describe('game-style team roster order', () => {
  it('groups carriers, battleships, cruisers, destroyers, submarines, and unknown ships', () => {
    const types: ShipType[] = ['Unknown', 'Submarine', 'Destroyer', 'Cruiser', 'Battleship', 'AirCarrier']
    expect(names(types.map(type => player(type, { type })))).toEqual([...types].reverse())
  })

  it('orders tiers descending inside each class, including superships', () => {
    expect(names([player('Tier VIII', { tier: 8 }), player('Tier X'), player('Supership', { tier: 11 }), player('Carrier', { type: 'AirCarrier', tier: 6 })]))
      .toEqual(['Carrier', 'Supership', 'Tier X', 'Tier VIII'])
  })

  it('uses internal nation order instead of translated names or English alphabetic order', () => {
    const nations = ['pan_asia', 'europe', 'japan', 'ussr', 'italy', 'germany', 'uk', 'usa', 'france', 'spain', 'pan_america', 'commonwealth', 'netherlands', 'unknown']
    expect(names(nations.map(nation => player(nation, { nation })))).toEqual(['usa', 'uk', 'france', 'germany', 'netherlands', 'italy', 'japan', 'ussr', 'spain', 'commonwealth', 'pan_america', 'europe', 'pan_asia', 'unknown'])
  })

  it('compares ship IDs numerically without losing precision, then uses player names for identical ships', () => {
    expect(names([player('Zulu', { id: '9' }), player('alpha', { id: '9' }), player('Ten', { id: '10' }), player('Large', { id: '9007199254740992' }), player('Larger', { id: '9007199254740993' })]))
      .toEqual(['Larger', 'Large', 'Ten', 'alpha', 'Zulu'])
    expect(names([player('invalid-low', { id: '09a' }), player('Nine', { id: '9' }), player('Ten', { id: '10' }), player('invalid-high', { id: '1a' })]))
      .toEqual(['Ten', 'Nine', 'invalid-high', 'invalid-low'])
  })

  it('keeps input snapshots and exact ties unchanged', () => {
    const first = player('same'), second = { ...player('same'), key: 'second' }, carrier = player('carrier', { type: 'AirCarrier' })
    const input = Object.freeze([first, second, carrier])
    const before = structuredClone(input)
    const sorted = sortRosterPlayers(input)
    expect(input).toEqual(before)
    expect(sorted).toEqual([carrier, first, second])
    expect(sorted[1]).toBe(first)
    expect(names([])).toEqual([])
  })

  it('does not move rows when statistics, lookup status, clan tags, or self flags change', () => {
    const players = [player('Zulu'), player('Alpha')]
    const updated = players.map((entry, index) => ({ ...entry, clanTag: index ? 'ZZZ' : 'AAA', isSelf: index === 0, stats: null, status: index ? 'hidden' as const : 'pending' as const }))
    expect(names(updated)).toEqual(names(players))
  })
})
