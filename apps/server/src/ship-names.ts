import overrides from '../resources/ship-name-overrides.json' with { type: 'json' }
import idOverrides from '../resources/ship-name-overrides-by-id.json' with { type: 'json' }

interface NamedShip {
  'name_en-us': string
  'name_zh-cn': string
  nation: string
  type: string
}

function normalizeName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/gu, ' ').trim().toLowerCase()
}

const names = new Map<string, string>()
const idNames = new Map<string, string>()
for (const [id, chinese] of Object.entries(idOverrides)) {
  if (!/^\d{1,20}$/.test(id) || !chinese.trim()) throw new Error(`Invalid ship ID name override: ${id}`)
  idNames.set(id, chinese)
}
for (const [english, chinese] of Object.entries(overrides)) {
  const key = normalizeName(english)
  if (!key || !chinese.trim() || (names.has(key) && names.get(key) !== chinese)) throw new Error(`Invalid or conflicting ship name override: ${english}`)
  names.set(key, chinese)
}

export function usesOriginalShipNames(nation: string, type: string): boolean {
  return ['japan', 'pan_asia'].includes(nation) && ['AirCarrier', 'Battleship', 'Cruiser', 'Destroyer', 'Submarine'].includes(type)
}

export function restoreShipName(english: string, chinese: string, nation: string, type: string, id?: string): string {
  // A known ship ID remains authoritative when upstream names or metadata change.
  const byId = id === undefined ? undefined : idNames.get(id)
  if (byId) return byId
  if (!usesOriginalShipNames(nation, type)) return chinese
  const key = normalizeName(english)
  const exact = names.get(key)
  if (exact) return exact
  // Match complete variant wrappers without replacing parts of unrelated names.
  if (key.startsWith('[') && key.endsWith(']')) {
    const base = names.get(key.slice(1, -1).trim())
    if (base) return `[${base}]`
  }
  const blackVariant = /^(.*) b$/.exec(key)
  if (blackVariant) {
    const base = names.get(blackVariant[1])
    if (base) return `${base} B`
  }
  return chinese
}

export function restoreCatalogShip<T extends NamedShip>(ship: T, id?: string): T {
  const name = restoreShipName(ship['name_en-us'], ship['name_zh-cn'], ship.nation, ship.type, id)
  return name === ship['name_zh-cn'] ? ship : { ...ship, 'name_zh-cn': name }
}

export function restoreCatalogNames<T extends { ships: Record<string, NamedShip> }>(catalog: T): T {
  return { ...catalog, ships: Object.fromEntries(Object.entries(catalog.ships).map(([id, ship]) => [id, restoreCatalogShip(ship, id)])) }
}

export function auditShipNames(catalog: { ships: Record<string, NamedShip> }) {
  const scoped = Object.entries(catalog.ships).filter(([, ship]) => usesOriginalShipNames(ship.nation, ship.type))
  const summarize = ([id, ship]: [string, NamedShip]) => ({ id, english: ship['name_en-us'], chinese: restoreCatalogShip(ship, id)['name_zh-cn'] })
  return {
    scopedShips: scoped.length,
    missingIdMappings: scoped.filter(([id]) => !idNames.has(id)).map(summarize),
    untranslatedNames: scoped.map(summarize).filter(ship => !/\p{Script=Han}/u.test(ship.chinese) && !/^I-\d+(?: '\d+)?$/.test(ship.chinese)),
  }
}
