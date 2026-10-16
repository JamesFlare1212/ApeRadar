import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import path from 'node:path'
import { buildBattle, detectRegion, latestArena, parseArenaBytes, readArenaFile } from '@aperadar/server/arena'
import { arena, catalog, removeTemp, settings, tempDirectory } from './helpers.js'

const directories: string[] = []
afterEach(() => { directories.splice(0).forEach(removeTemp) })
describe('safe game-file parsing', () => {
  it('accepts whitespace/BOM and reads replay length in bytes, including Unicode', () => {
    const input = arena('舰长甲'), json = Buffer.from(JSON.stringify(input))
    const replay = Buffer.alloc(json.length + 12 + 20); Buffer.from([18, 50, 52, 17]).copy(replay); replay.writeUInt32LE(1, 4); replay.writeUInt32LE(json.length, 8); json.copy(replay, 12)
    expect(parseArenaBytes(Buffer.from('\uFEFF  ' + JSON.stringify(input)))).toEqual(input)
    expect(parseArenaBytes(replay)).toEqual(input)
  })
  it('rejects truncated and oversized blocks before decoding', () => {
    const replay = Buffer.alloc(12); Buffer.from([18, 50, 52, 17]).copy(replay); replay.writeUInt32LE(100, 8)
    expect(() => parseArenaBytes(replay)).toThrow('不完整')
    replay.writeUInt32LE(9_000_000, 8); expect(() => parseArenaBytes(replay)).toThrow('大小无效')
    expect(() => parseArenaBytes(Buffer.from('not JSON'))).toThrow('有效的阵容')
  })
  it('never confuses vehicle IDs with account IDs, and separates teams/regions', () => {
    const input = arena(), config = settings(); config.secondaryEnabled = true; config.secondaryRegion = 'EU'
    input.vehicles.push({ id: 44, name: 'EnemyCaptain', relation: 2, shipId: input.vehicles[0].shipId }, { id: 2, name: 'NonPlayer', relation: 1, shipId: input.vehicles[0].shipId })
    const battle = buildBattle(input, 'test.json', config, 'ASIA', catalog)
    expect(battle.players).toHaveLength(2)
    expect(battle.players[0].accountId).toBeNull()
    expect(battle.players[0].isSelf).toBe(true)
    expect(battle.players[1].region).toBe('EU')
    expect(battle.players[1].team).toBe('enemy')
  })
  it('finds a matching account throughout names and marks bots without requesting them', () => {
    const input = arena(':Bot'); const battle = buildBattle(input, 'test.json', settings(), 'NA', catalog)
    expect(battle.players[0].status).toBe('bot')
    expect(buildBattle(input, 'same.json', settings(), 'NA', catalog).id).toBe(battle.id)
  })
  it('parses the last realm with LF, CRLF, or no trailing newline', () => {
    expect(detectRegion('Selected realm: eu\r\nSelected realm: asia\r\n')).toBe('ASIA')
    expect(detectRegion('Selected realm: na')).toBe('NA')
    expect(() => detectRegion('Selected realm: cn')).toThrow('国服在线查询已停止支持')
    expect(() => detectRegion('no region')).toThrow('手动选择')
  })
  it('selects the newest recursive arena and reads only a replay’s first JSON block', async () => {
    const root = tempDirectory(); directories.push(root)
    for (const name of ['old', 'new']) { mkdirSync(path.join(root, 'replays', name), { recursive: true }); writeFileSync(path.join(root, 'replays', name, 'tempArenaInfo.json'), JSON.stringify(arena())) }
    utimesSync(path.join(root, 'replays', 'old', 'tempArenaInfo.json'), new Date(100000), new Date(100000))
    expect((await latestArena(root))?.path).toContain(`${path.sep}new${path.sep}`)
    const bytes = await readArenaFile(path.join(root, 'replays', 'new', 'tempArenaInfo.json'))
    expect(parseArenaBytes(bytes)).toEqual(arena())
  })
})
