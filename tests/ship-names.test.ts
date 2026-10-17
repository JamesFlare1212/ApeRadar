import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { auditShipNames, restoreCatalogNames, restoreShipName } from '@aperadar/server/ship-names'
import { ShipCatalogApi, readCatalog, writeCatalog, type ShipCatalog } from '@aperadar/server/ship-catalog'
import { MissingShipLookup } from '@aperadar/server/missing-ships'
import { RadarDatabase } from '@aperadar/server/database'
import { RadarService } from '@aperadar/server/service'
import { getShip } from '@aperadar/server/arena'
import { arena, catalog, fixturePlayer, removeTemp, settings, tempDirectory } from './helpers'

const masked = { 'name_en-us': 'Yamato', 'name_zh-cn': '鲸', nation: 'japan', tier: 10, type: 'Battleship' as const }
const localCatalog = (): ShipCatalog => ({ version: '15.9.0', date: '20261007', ships: { '1': { ...masked } } })
const emptyCatalog = (): ShipCatalog => ({ ...localCatalog(), ships: {} })
const info = { game_version: '15.9.0', ships_updated_at: 1791365645 }
const apiFetcher = () => vi.fn<typeof fetch>(async input => {
  const url = new URL(String(input))
  if (url.pathname.endsWith('/info/')) return Response.json({ status: 'ok', data: info })
  return Response.json({ status: 'ok', data: { '1': { ship_id: 1, name: url.searchParams.get('language') === 'en' ? 'Yamato' : '鲸', nation: 'japan', tier: 10, type: 'Battleship' } }, meta: { count: 1, page: 1, page_total: 1, total: 1 } })
})

describe('original Chinese ship names', () => {
  it.each([
    ['Yamato', '鲸', 'japan', 'Battleship', '大和'],
    ['Atago', '犬', 'japan', 'Cruiser', '爱宕'],
    ['Shimakaze', '芒', 'japan', 'Destroyer', '岛风'],
    ['Hakuryū', '鹫', 'japan', 'AirCarrier', '白龙'],
    ['Xin Zhong Guo\u00a014', '先驱04', 'pan_asia', 'Submarine', '新中国14'],
    ['Chungking', '巴海', 'pan_asia', 'Cruiser', '重庆'],
    ['Loyang', '雒安', 'pan_asia', 'Destroyer', '洛阳'],
    ['Ōta', '猢', 'japan', 'Cruiser', '太田'],
    ['Tōgasa', '鳝', 'japan', 'Battleship', '远笠'],
    ['Akagi', '凰', 'japan', 'AirCarrier', '赤城'],
    ['Incheon B', '仁海 (黑)', 'pan_asia', 'Cruiser', '仁川 B'],
  ])('restores %s using its original name', (english, chinese, nation, type, expected) => {
    expect(restoreShipName(english, chinese, nation, type)).toBe(expected)
  })
  it('matches Unicode, diacritics, spaces, historical aliases, and complete variant wrappers', () => {
    expect(restoreShipName('  Zao\u0304  ', '象', 'japan', 'Cruiser')).toBe('藏王')
    expect(restoreShipName('Shinonome\u00a0B', '茜 （黑）', 'japan', 'Destroyer')).toBe('东云 B')
    expect(restoreShipName('Iwaki Alpha', '貆', 'japan', 'Cruiser')).toBe('岩城 Alpha')
    expect(restoreShipName('Eastern Dragon', '昆仑', 'japan', 'Cruiser')).toBe('东方神龙')
    expect(restoreShipName('[Akagi]', '[凰]', 'japan', 'AirCarrier')).toBe('[赤城]')
    expect(restoreShipName('Akagi B', '凰 (黑)', 'japan', 'AirCarrier')).toBe('赤城 B')
  })
  it('preserves unknown names, unrelated nations, unknown ship types, and partial matches', () => {
    for (const [english, nation, type] of [['Unknown New Ship', 'japan', 'Cruiser'], ['Super Yamato', 'japan', 'Battleship'], ['Yamato', 'usa', 'Battleship'], ['New Carrier', 'pan_asia', 'AirCarrier'], ['Yamato', 'japan', 'Unknown']]) {
      expect(restoreShipName(english, 'API name', nation, type)).toBe('API name')
    }
  })
  it.each([
    ['3540989136', 'Yimeng', '东沂', '沂蒙'],
    ['3551474896', 'Taihang', '太恒', '太行'],
    ['3552523472', 'Xuan Wu', '毒龟', '玄武'],
    ['3729732816', 'Louchuan', '冢虎', '楼船'],
    ['3740218576', 'Sun Yat-Sen', '载之', '孙中山'],
  ])('restores Pan-Asian battleship %s by ID and by English fallback', (id, english, chinese, expected) => {
    expect(restoreShipName('Renamed battleship', chinese, 'pan_asia', 'Battleship', id)).toBe(expected)
    expect(restoreShipName(english, chinese, 'pan_asia', 'Battleship', '999999')).toBe(expected)
  })
  it.each([
    ['3522082512', 'ARP Nachi', 'ARP 那智'], ['3542005456', 'ARP Maya', 'ARP 摩耶'],
    ['3551442640', 'ARP Haguro', 'ARP 羽黑'], ['3552491216', 'ARP Takao', 'ARP 高雄'],
    ['3552523984', 'ARP Hiei', 'ARP 比叡'], ['3553539792', 'ARP Ashigara', 'ARP 足柄'],
    ['3553572560', 'ARP Haruna', 'ARP 榛名'], ['3554621136', 'ARP Kirishima', 'ARP 雾岛'],
    ['3555636944', 'ARP Myōkō', 'ARP 妙高'], ['3555669712', 'ARP Kongō', 'ARP 金刚'],
    ['3560912592', 'ARP Yamato', 'ARP 大和'],
  ])('restores the verified ARP name for %s', (id, english, expected) => {
    expect(restoreShipName(english, 'Masked', 'japan', 'Cruiser', id)).toBe(expected)
    expect(restoreShipName(english, 'Masked', 'japan', 'Cruiser')).toBe(expected)
  })
  it.each([
    ['3363780304', 'Ragnarok', '诸神黄昏'], ['3374266064', 'Ignis Purgatio', '炼狱烈焰'],
    ['3434526416', "BA Arona's Whale", 'BA 阿罗娜的小鲸鱼'], ['3541972176', 'Ship Smasha', '冲撞跳跳'],
  ])('keeps the verified Chinese collaboration name for %s', (id, english, expected) => {
    expect(restoreShipName(english, 'Masked', 'japan', 'Battleship', id)).toBe(expected)
  })
  it('gives a known ID precedence over conflicting English names and stale metadata', () => {
    expect(restoreShipName('Atago', '犬', 'japan', 'Cruiser', '4276041424')).toBe('大和')
    expect(restoreShipName('Renamed ship', 'Masked', 'unknown', 'Unknown', '4276041424')).toBe('大和')
    expect(restoreShipName('Atago', '犬', 'japan', 'Cruiser', '999999')).toBe('爱宕')
    expect(getShip(emptyCatalog(), '4276041424')).toMatchObject({ name: '大和', tier: 0, type: 'Unknown' })
    expect(getShip(emptyCatalog(), '999999').name).toBe('未知舰船')
  })
  it('reports unknown IDs and untranslated names while allowing submarine identifiers', () => {
    const audit = auditShipNames({ ships: {
      '4276041424': { ...masked, 'name_en-us': 'Renamed flagship' },
      '999999': { ...masked, 'name_en-us': 'Unknown new ship', 'name_zh-cn': 'Unknown new ship' },
      '3751196368': { ...masked, type: 'Submarine', 'name_en-us': 'Renamed submarine', 'name_zh-cn': 'I-56' },
    } })
    expect(audit.scopedShips).toBe(3)
    expect(audit.missingIdMappings.map(ship => ship.id)).toEqual(['999999'])
    expect(audit.untranslatedNames.map(ship => ship.id)).toEqual(['999999'])
  })
  it('covers every bundled Japanese and Pan-Asian ship with an ID mapping and a reviewed name', () => {
    const audit = auditShipNames(catalog)
    expect(audit.scopedShips).toBeGreaterThan(0)
    expect(audit.missingIdMappings).toEqual([])
    expect(audit.untranslatedNames).toEqual([])
  })
  it('applies ID overrides when normalizing, saving, and reading catalog entries', async () => {
    const directory = tempDirectory()
    const source = { ...localCatalog(), ships: { '3552523472': { ...masked, nation: 'pan_asia', 'name_en-us': 'Renamed battleship', 'name_zh-cn': '毒龟' } } }
    try {
      expect(restoreCatalogNames(source).ships['3552523472']['name_zh-cn']).toBe('玄武')
      expect(getShip(source, '3552523472').name).toBe('玄武')
      const filename = path.join(directory, 'ships.json')
      await writeCatalog(filename, source)
      expect((await readCatalog(filename)).ships['3552523472']['name_zh-cn']).toBe('玄武')
    } finally { removeTemp(directory) }
  })
  it('changes only Chinese names, does not mutate its input, and is idempotent', () => {
    const original = localCatalog(), result = restoreCatalogNames(original)
    expect(result.ships['1']).toEqual({ ...masked, 'name_zh-cn': '大和' })
    expect(original.ships['1']['name_zh-cn']).toBe('鲸')
    expect(result.version).toBe(original.version)
    expect(restoreCatalogNames(result)).toEqual(result)
    expect(getShip(original, '1').name).toBe('大和')
  })
  it('persists restored names when writing a local catalog', async () => {
    const directory = tempDirectory()
    try {
      const filename = path.join(directory, 'ships.json')
      await writeCatalog(filename, localCatalog())
      expect((await readCatalog(filename)).ships['1']).toEqual({ ...masked, 'name_zh-cn': '大和' })
    } finally { removeTemp(directory) }
  })
  it('restores both full API updates and targeted lookups without extra translation requests', async () => {
    const fetcher = apiFetcher(), api = new ShipCatalogApi(settings(), { fetcher, spacing: 0 })
    expect((await api.getShips(['1'], 'NA', new AbortController().signal))['1']['name_zh-cn']).toBe('大和')
    const updated = await api.updateCatalog({ ...localCatalog(), ships: { '2': { ...masked } } }, 'NA', new AbortController().signal)
    expect(updated.ships['1']['name_zh-cn']).toBe('大和')
    expect(updated.ships['2']['name_zh-cn']).toBe('大和')
    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(fetcher.mock.calls.every(([url]) => ['en', 'zh-cn', null].includes(new URL(String(url)).searchParams.get('language')))).toBe(true)
  })
  it('preserves a renamed ship ID through API lookups and the supplementary cache', async () => {
    const id = '3552523472'
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/info/')) return Response.json({ status: 'ok', data: info })
      return Response.json({ status: 'ok', data: { [id]: { ship_id: Number(id), name: url.searchParams.get('language') === 'en' ? 'New upstream name' : '毒龟', nation: 'pan_asia', tier: 9, type: 'Battleship' } }, meta: { count: 1, page: 1, page_total: 1, total: 1 } })
    })
    const api = new ShipCatalogApi(settings(), { fetcher, spacing: 0 })
    expect((await api.getShips([id], 'NA', new AbortController().signal))[id]['name_zh-cn']).toBe('玄武')
    expect((await api.updateCatalog(emptyCatalog(), 'NA', new AbortController().signal)).ships[id]['name_zh-cn']).toBe('玄武')
    const database = new RadarDatabase(':memory:')
    try {
      const lookup = new MissingShipLookup(database, emptyCatalog(), { fetcher, spacing: 0 })
      await lookup.resolve([id], 'NA', settings(), new AbortController().signal)
      expect(database.getCatalogShips()[id]['name_zh-cn']).toBe('玄武')
      database.saveCatalogShips({ [id]: { ...masked, nation: 'pan_asia', 'name_en-us': 'New upstream name', 'name_zh-cn': '毒龟' } })
      const restored = emptyCatalog(), offline = vi.fn<typeof fetch>()
      const reopened = new MissingShipLookup(database, restored, { fetcher: offline })
      await reopened.resolve([id], 'NA', settings(), new AbortController().signal)
      expect(restored.ships[id]['name_zh-cn']).toBe('玄武')
      expect(offline).not.toHaveBeenCalled()
    } finally { database.close() }
  })
  it('restores old supplementary cache entries offline and persists newly fetched names', async () => {
    const database = new RadarDatabase(':memory:'), fetcher = apiFetcher()
    try {
      database.saveCatalogShips({ '2': masked })
      const target = emptyCatalog(), lookup = new MissingShipLookup(database, target, { fetcher, spacing: 0 })
      expect(target.ships['2']['name_zh-cn']).toBe('大和')
      await lookup.resolve(['2'], 'NA', settings(), new AbortController().signal)
      expect(fetcher).not.toHaveBeenCalled()
      await lookup.resolve(['1'], 'NA', settings(), new AbortController().signal)
      expect(database.getCatalogShips()['1']['name_zh-cn']).toBe('大和')
    } finally { database.close() }
  })
  it('restores existing history snapshots while preserving player statistics', () => {
    const database = new RadarDatabase(':memory:'), fetcher = vi.fn<typeof fetch>()
    const battle = { id: 'masked-history', sourceName: 'history.json', isDemo: false, importedAt: new Date().toISOString(), startedAt: new Date().toISOString(), mode: 'pvp', map: 'Test', players: [{ ...fixturePlayer(), ship: { id: '4276041424', name: '鲸', nameEn: 'Renamed flagship', nation: 'japan', tier: 10, type: 'Battleship' as const } }] }
    database.saveBattle(battle)
    const service = new RadarService(database, { ...catalog, ships: { ...catalog.ships, '1': masked } }, undefined, { fetcher })
    try {
      expect(service.state().battle?.players[0].ship.name).toBe('大和')
      expect(service.state().battle?.players[0].stats).toEqual(battle.players[0].stats)
      service.loadDemo()
      expect(service.loadBattle(battle.id).battle?.players[0].ship.name).toBe('大和')
      expect(database.getBattle(battle.id)?.players[0].ship.name).toBe('大和')
      expect(fetcher).not.toHaveBeenCalled()
    } finally { service.dispose() }
  })
  it('restores missing ships in imported lineups and later cache-backed imports', async () => {
    const fetcher = apiFetcher(), database = new RadarDatabase(':memory:')
    const service = new RadarService(database, catalog, undefined, { fetcher })
    try {
      service.saveSettings({ ...settings(), autoQuery: false })
      const input = arena(); input.vehicles[0].shipId = '1'
      await service.importBytes(Buffer.from(JSON.stringify(input)), 'arena.json', false)
      await vi.waitFor(() => expect(service.state().battle?.players[0].ship.name).toBe('大和'))
      expect(database.getCatalogShips()['1']['name_zh-cn']).toBe('大和')
      await service.importBytes(Buffer.from(JSON.stringify(input)), 'arena.json', false)
      expect(service.state().battle?.players[0].ship.name).toBe('大和')
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { service.dispose() }
  })
})
