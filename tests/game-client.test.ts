import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { discoverGameClients, parseKeyValues } from '@aperadar/server/game-discovery'
import { inspectGameClient } from '@aperadar/server/game-client'
import { detectGameRegion, preferencesRegion } from '@aperadar/server/game-region'
import { createGameClient, removeTemp, tempDirectory } from './helpers.js'

const directories: string[] = []
const temporary = () => { const directory = tempDirectory(); directories.push(directory); return directory }
afterEach(() => { directories.splice(0).forEach(removeTemp) })
const quoted = (value: string) => JSON.stringify(value)

describe('current game client discovery', () => {
  it('finds a WGC installation from a path-pointer file and validates the installed build', async () => {
    const root = temporary(), game = createGameClient(path.join(root, 'Game'))
    createGameClient(game, 'NA', '99999')
    writeFileSync(path.join(game, 'game_info.xml'), '<protocol><part_versions><version available="99.0.0.0.99999" installed="15.9.0.0.12345" name="client"/></part_versions></protocol>')
    const pointer = path.join(root, 'ProgramData', 'Wargaming.net', 'GameCenter', 'apps', 'wows.ww.production')
    mkdirSync(pointer, { recursive: true })
    writeFileSync(path.join(pointer, 'installation'), game)
    const result = await discoverGameClients({ programData: path.join(root, 'ProgramData'), steamPath: null })
    expect(result.warnings).toEqual([])
    expect(result.clients).toHaveLength(1)
    expect(result.clients[0]).toMatchObject({ valid: true, build: '12345', version: '15.9.0.0', installationRealm: 'WW', sources: ['wgc'], region: { status: 'detected', region: 'NA' } })
  })
  it('reads modern nested Steam libraries, validates the manifest, and merges duplicate WGC paths', async () => {
    const root = temporary(), steam = path.join(root, 'Steam'), library = path.join(root, 'Library')
    const game = createGameClient(path.join(library, 'steamapps', 'common', 'World of Warships'))
    mkdirSync(path.join(steam, 'steamapps'), { recursive: true })
    writeFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), `// modern format\n"libraryfolders" { "0" { "path" ${quoted(steam)} } "1" { "path" ${quoted(library)} "apps" { "552990" "1000" } } }`)
    writeFileSync(path.join(library, 'steamapps', 'appmanifest_552990.acf'), '"AppState" { "appid" "552990" "installdir" "World of Warships" }')
    const pointer = path.join(root, 'ProgramData', 'Wargaming.net', 'GameCenter', 'apps', 'wows.ww.production')
    mkdirSync(pointer, { recursive: true })
    writeFileSync(path.join(pointer, 'one'), game)
    writeFileSync(path.join(pointer, 'two'), game.toUpperCase())
    const result = await discoverGameClients({ programData: path.join(root, 'ProgramData'), steamPath: steam })
    expect(result.clients).toHaveLength(1)
    expect(result.clients[0].sources).toEqual(['wgc', 'steam'])
    expect(result.clients[0].region.region).toBe('NA')
  })
  it('does not follow manifest traversal or pretend stale installation records are valid', async () => {
    const root = temporary(), steam = path.join(root, 'Steam')
    mkdirSync(path.join(steam, 'steamapps'), { recursive: true })
    writeFileSync(path.join(steam, 'steamapps', 'appmanifest_552990.acf'), '"AppState" { "appid" "552990" "installdir" "../../other" }')
    const result = await discoverGameClients({ programData: null, steamPath: steam })
    expect(result.clients).toEqual([])
    const fake = path.join(root, 'Not a game')
    mkdirSync(fake)
    writeFileSync(path.join(fake, 'WorldOfWarships.exe'), 'fixture')
    expect(await inspectGameClient(fake)).toMatchObject({ valid: false })
    expect(await inspectGameClient('replays')).toMatchObject({ valid: false })
  })
  it('rejects malformed, ambiguous, and excessively nested Steam records', () => {
    expect(parseKeyValues('"LibraryFolders" { "0" { "path" "D:\\\\Games" } }').libraryfolders).toMatchObject({ '0': { path: 'D:\\Games' } })
    expect(() => parseKeyValues('"a" {')).toThrow('不完整')
    expect(() => parseKeyValues('"A" "one" "a" "two"')).toThrow('重复')
    expect(() => parseKeyValues('"a" { '.repeat(18) + '}'.repeat(18))).toThrow('嵌套')
  })
  it('requires the current 64-bit layout and tolerates a replay directory not yet created', async () => {
    const game = createGameClient(temporary())
    rmdirSync(path.join(game, 'replays'))
    expect(await inspectGameClient(game)).toMatchObject({ valid: true, replaysAvailable: false })
    rmSync(path.join(game, 'bin', '12345', 'bin64', 'WorldOfWarships64.exe'))
    expect(await inspectGameClient(game)).toMatchObject({ valid: false })
  })
  it('rejects renamed non-executables and does not substitute an older build for an incomplete installed version', async () => {
    const game = createGameClient(temporary())
    writeFileSync(path.join(game, 'bin', '12345', 'bin64', 'WorldOfWarships64.exe'), 'not an executable')
    expect(await inspectGameClient(game)).toMatchObject({ valid: false })
    createGameClient(game)
    writeFileSync(path.join(game, 'game_info.xml'), '<protocol><part_versions><version name="client" installed="15.9.0.0.99999"/></part_versions></protocol>')
    expect(await inspectGameClient(game)).toMatchObject({ valid: false })
  })
})

describe('evidence-based game region detection', () => {
  it('extracts only the active server section even when other game element names are not XML', async () => {
    const game = createGameClient(temporary())
    const text = '<preferences.xml><scriptsPreferences><ui><1@name>0</1@name></ui><net_credentials><active_server> wows \t na </active_server></net_credentials></scriptsPreferences><active_server>WOWS EU</active_server></preferences.xml>'
    writeFileSync(path.join(game, 'preferences.xml'), text)
    expect(preferencesRegion(text)).toBe('NA')
    expect(await detectGameRegion(game)).toMatchObject({ status: 'detected', region: 'NA' })
    expect(preferencesRegion(text.replace('</net_credentials>', '<active_server>WOWS EU</active_server></net_credentials>'))).toBeNull()
    expect(preferencesRegion('<!-- <scriptsPreferences><net_credentials><active_server>WOWS EU</active_server></net_credentials></scriptsPreferences> -->')).toBeNull()
  })
  it('reports conflicting sources instead of selecting an arbitrary region', async () => {
    const game = createGameClient(temporary())
    writeFileSync(path.join(game, 'profile', 'clientrunner.log'), 'Selected realm: EU\r\n')
    expect(await detectGameRegion(game)).toMatchObject({ status: 'conflict', region: null })
  })
  it('does not treat WW, missing evidence, oversized preferences, or old logs as a default region', async () => {
    const game = createGameClient(temporary())
    writeFileSync(path.join(game, 'preferences.xml'), '<preferences.xml><currentRealm>WW</currentRealm></preferences.xml>')
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000)
    utimesSync(path.join(game, 'profile', 'clientrunner.log'), old, old)
    const result = await detectGameRegion(game)
    expect(result).toMatchObject({ status: 'unknown', region: null })
    expect(result.evidence.find(item => item.source === 'log')?.stale).toBe(true)
    writeFileSync(path.join(game, 'preferences.xml'), 'x'.repeat(2 * 1024 * 1024 + 1))
    expect((await detectGameRegion(game)).region).toBeNull()
    expect((await detectGameRegion('')).region).toBeNull()
  })
  it('uses a bounded log tail and never crosses a newline after an empty realm marker', async () => {
    const game = createGameClient(temporary())
    rmSync(path.join(game, 'preferences.xml'))
    writeFileSync(path.join(game, 'profile', 'clientrunner.log'), 'x'.repeat(300_000) + '\nSelected realm: na')
    expect(await detectGameRegion(game)).toMatchObject({ status: 'detected', region: 'NA' })
    writeFileSync(path.join(game, 'profile', 'clientrunner.log'), 'Selected realm:\nNA\n')
    expect(await detectGameRegion(game)).toMatchObject({ status: 'unknown', region: null })
    createGameClient(game, 'NA')
    writeFileSync(path.join(game, 'profile', 'clientrunner.log'), 'Selected realm: future-realm\n')
    expect(await detectGameRegion(game)).toMatchObject({ status: 'unknown', region: null })
  })
  it('keeps an explicitly unsupported region distinct from an unknown region', async () => {
    const game = createGameClient(temporary(), 'CN')
    expect(await detectGameRegion(game)).toMatchObject({ status: 'unsupported', region: null })
  })
})
