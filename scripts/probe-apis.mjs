import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { DOMAINS, normalizeProfile, parseCombat, WargamingApi } from '@aperadar/server/api'
import { getShip } from '@aperadar/server/arena'
import { probeApiHealth } from '@aperadar/server/health'
import { DEFAULT_SETTINGS } from '@aperadar/shared/settings'

// Opt-in live checks. Never reads game logs, changes settings, or writes player caches.
const applicationId = process.env.WG_APPLICATION_ID
assert.match(applicationId ?? '', /^[a-zA-Z0-9]{1,64}$/, 'Set WG_APPLICATION_ID before running this probe')
const settings = { ...DEFAULT_SETTINGS, api: 'WG_PUBLIC', wgApplicationId: applicationId, retryAttempts: 0 }
const catalog = JSON.parse(await readFile(new URL('../apps/server/resources/ships.json', import.meta.url), 'utf8'))
const signal = AbortSignal.timeout(120_000)
const requests = []
const samples = new Map()
const report = { startedAt: new Date().toISOString(), applicationIdSuffix: applicationId.slice(-6), health: null, functional: [], negative: null, requests }

const fetcher = async (input, options) => {
  const url = new URL(String(input))
  // Keep endpoint and protocol diagnostics; omit credentials and player identifiers.
  const entry = { endpoint: url.origin + url.pathname.replace(/\/accounts\/\d+/g, '/accounts/:id').replace(/\/accounts\/search\/[^/]+/g, '/accounts/search/:nickname'), parameters: [...url.searchParams.keys()], httpStatus: null }
  requests.push(entry)
  const start = performance.now()
  try {
    const response = await fetch(input, options)
    entry.httpStatus = response.status
    const text = await response.clone().text()
    try {
      const json = JSON.parse(text)
      entry.apiStatus = json.status ?? null
      entry.error = json.error ?? null
      if (json.status !== 'ok') entry.topLevelKeys = Object.keys(json)
    } catch { entry.contentType = response.headers.get('content-type'); entry.invalidJson = true }
    return response
  } catch (error) {
    entry.error = { message: error.message, code: error.cause?.code ?? error.code ?? null, cause: error.cause?.message ?? null }
    throw error
  } finally { entry.latencyMs = Math.round(performance.now() - start) }
}

const api = new WargamingApi(settings, { fetcher, timeout: 8000 })
const wg = (region, endpoint, parameters) => `https://api.${DOMAINS[region]}/wows/${endpoint}/?${new URLSearchParams({ application_id: applicationId, ...parameters })}`
const modes = ['pvp', 'pvp_solo', 'pvp_div2', 'pvp_div3']

async function functional(region, source) {
  const firstRequest = requests.length
  const result = { region, source, ok: false }
  report.functional.push(result)
  try {
    const root = `https://vortex.${DOMAINS[region]}/api/accounts`
    const sample = samples.get(region)
    const search = await api.json(source === 'WG_PUBLIC' ? wg(region, 'account/list', { search: region === 'EU' ? 'Flamu' : 'Test', limit: '20' }) : `${root}/search/${encodeURIComponent(sample?.name ?? 'Test')}/`, signal)
    assert.ok(Array.isArray(search.data) && search.data.length, 'No public sample candidates found')
    const candidates = source === 'WG_PUBLIC' ? search.data.slice(0, 20) : search.data.filter(item => sample ? item.name.toLowerCase() === sample.name.toLowerCase() : item.statistics?.pvp?.battles_count > 0).sort((a, b) => (b.statistics?.pvp?.battles_count ?? 0) - (a.statistics?.pvp?.battles_count ?? 0)).slice(0, 3)
    let profile, candidate, id
    if (source === 'WG_PUBLIC') {
      const accounts = await api.json(wg(region, 'account/info', { account_id: candidates.map(item => item.account_id).join(','), extra: 'statistics.pvp_solo,statistics.pvp_div2,statistics.pvp_div3' }), signal)
      candidate = candidates.filter(item => accounts.data[item.account_id]?.hidden_profile === false && accounts.data[item.account_id]?.statistics?.pvp?.battles > 0)
        .sort((a, b) => accounts.data[b.account_id].statistics.pvp.battles - accounts.data[a.account_id].statistics.pvp.battles)[0]
      assert.ok(candidate, 'No public sample with random-battle statistics found')
      id = String(candidate.account_id)
      profile = accounts.data[id]
    } else {
      for (const item of candidates) {
        const account = await api.json(`${root}/${item.spa_id}/`, signal)
        const value = account.data?.[item.spa_id]
        if (value && !value.hidden_profile && value.statistics?.pvp?.battles_count > 0) { candidate = item; id = String(item.spa_id); profile = value; break }
      }
      assert.ok(candidate, 'No public Vortex sample with random-battle statistics found')
    }
    let shipId, expectedShip
    if (source === 'WG_PUBLIC') {
      const ships = await api.json(wg(region, 'ships/stats', { account_id: id, extra: 'pvp_solo,pvp_div2,pvp_div3' }), signal)
      expectedShip = ships.data[id].filter(ship => ship.pvp?.battles > 0 && catalog.ships[ship.ship_id]).sort((a, b) => b.pvp.battles - a.pvp.battles)[0]
      assert.ok(expectedShip, 'No played ship in the local catalog found')
      shipId = String(expectedShip.ship_id)
    } else shipId = sample?.shipId ?? Object.entries(catalog.ships).find(([, ship]) => ship['name_en-us'] === 'Yamato')[0]
    const player = { key: `probe-${region}`, accountId: null, name: candidate.nickname ?? candidate.name, region, team: 'ally', isSelf: false, ship: getShip(catalog, shipId), clanTag: '', clanId: null, status: 'pending', stats: null, error: null, fetchedAt: null, cached: false }
    const start = requests.length
    const players = []
    // Exercise the production pipeline with real HTTP, including exact nickname lookup.
    const client = new WargamingApi({ ...settings, api: source }, { fetcher, timeout: 8000 })
    await client.query([player], signal, value => players.push(value))
    assert.equal(players.length, 1)
    const actual = players[0]
    assert.equal(actual.status, 'ready', actual.error ?? 'Player did not become ready')
    if (source === 'WG_PUBLIC') assert.equal(actual.error, null)
    assert.equal(actual.accountId, id)
    for (const [key, value] of Object.entries(normalizeProfile(profile))) assert.deepEqual(actual.stats[key], value, `Account ${key} differs from API response`)
    if (expectedShip) {
      for (const [index, key] of ['ship', 'shipSolo', 'shipDiv2', 'shipDiv3'].entries()) assert.deepEqual(actual.stats[key], parseCombat(expectedShip[modes[index]]), `Ship ${key} differs from API response`)
      assert.ok(actual.stats.ship.battles > 0)
    }
    assert.equal(actual.stats.shipAvailable, true)
    const pipelineRequests = requests.slice(start)
    assert.equal(pipelineRequests.length, source === 'WG_PUBLIC' ? 4 : 7)
    const failedRequests = pipelineRequests.filter(item => item.httpStatus !== 200 || item.apiStatus !== 'ok')
    assert.ok(failedRequests.every(item => source === 'VORTEX' && item.endpoint.endsWith('/clans/') && item.httpStatus === 404), 'Unexpected endpoint failure')
    Object.assign(result, { ok: !actual.error, status: actual.error ? 'partial' : 'passed', warning: actual.error, profilePassed: true, pipelineRequests: pipelineRequests.length, accountBattles: actual.stats.overall.battles, accountWinrate: actual.stats.overall.wins / actual.stats.overall.battles * 100, shipBattles: actual.stats.ship.battles, shipAverageDamage: actual.stats.ship.battles ? actual.stats.ship.damage / actual.stats.ship.battles : null, shipAvailable: actual.stats.shipAvailable, clanTagPresent: Boolean(actual.clanTag), verifiedModes: modes })
    if (source === 'WG_PUBLIC') samples.set(region, { name: player.name, shipId })
  } catch (error) { result.error = error.message }
  result.totalRequests = requests.length - firstRequest
  console.log(JSON.stringify(result))
}

try {
  report.health = await probeApiHealth(settings, ['NA', 'EU', 'ASIA', 'RU'], signal, { fetcher, timeout: 8000 })
  for (const check of report.health.checks) console.log(`${check.region} ${check.source}: ${check.status} ${check.message}`)
  const negative = await fetcher(wg('NA', 'account/info', {}), { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
  const payload = await negative.json()
  report.negative = { httpStatus: negative.status, apiStatus: payload.status, error: payload.error, ok: payload.status === 'error' && payload.error?.message === 'ACCOUNT_ID_NOT_SPECIFIED' }
  assert.ok(report.negative.ok, 'Expected missing account_id to be rejected')
  for (const region of ['NA', 'EU', 'ASIA']) await functional(region, 'WG_PUBLIC')
  for (const check of report.health.checks.filter(check => check.source === 'VORTEX' && check.ok)) await functional(check.region, 'VORTEX')
  const official = report.functional.filter(item => item.source === 'WG_PUBLIC')
  report.officialPassed = official.length === 3 && official.every(item => item.ok)
  if (!report.officialPassed) process.exitCode = 1
} catch (error) { report.error = error.message; process.exitCode = 1 }
finally {
  report.finishedAt = new Date().toISOString()
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true })
  await writeFile(new URL('../artifacts/live-api-probe.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
  console.log('Report: artifacts/live-api-probe.json')
}
