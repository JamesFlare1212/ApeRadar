import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadApiConfig } from '@aperadar/server/config'
import { readCatalog, ShipCatalogApi, writeCatalog } from '@aperadar/server/ship-catalog'
import { DEFAULT_SETTINGS } from '@aperadar/shared/settings'
import { auditShipNames, restoreCatalogNames } from '@aperadar/server/ship-names'

const { values } = parseArgs({ options: {
  region: { type: 'string', default: 'NA' }, output: { type: 'string' },
  'dry-run': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  'names-only': { type: 'boolean', default: false },
} })
if (values.help) {
  console.log('Usage: pnpm ships:update [--region NA|EU|ASIA] [--output <file>] [--dry-run] [--names-only]')
  console.log('Uses config/api.json (or APERADAR_CONFIG_FILE), with WG_APPLICATION_ID taking precedence.')
  console.log('Updates bilingual ship details, preserving existing entries absent from the API.')
  console.log('Restores original Chinese names by default; --names-only applies local overrides without network access.')
  console.log('Ship IDs take precedence over English aliases; missing mappings are listed for review.')
} else {
  try {
    if (!['NA', 'EU', 'ASIA'].includes(values.region)) throw new Error('Region must be NA, EU, or ASIA')
    const root = fileURLToPath(new URL('../', import.meta.url))
    const source = path.join(root, 'apps/server/resources/ships.json')
    const previous = await readCatalog(source)
    let updated
    if (values['names-only']) updated = restoreCatalogNames(previous)
    else {
      const { config } = await loadApiConfig(path.join(root, 'config/api.json'))
      const api = new ShipCatalogApi({ ...DEFAULT_SETTINGS, wgApplicationId: config.wgApplicationId }, { config })
      updated = await api.updateCatalog(previous, values.region, AbortSignal.timeout(180_000))
    }
    const added = Object.keys(updated.ships).filter(id => !previous.ships[id]).length
    const changed = Object.keys(previous.ships).filter(id => JSON.stringify(previous.ships[id]) !== JSON.stringify(updated.ships[id])).length
    const destination = values.output ? path.resolve(values.output) : source
    if (!values['dry-run']) await writeCatalog(destination, updated)
    console.log(`${values['dry-run'] ? 'Preview' : 'Updated'}: ${updated.version} / ${updated.date}; ${Object.keys(updated.ships).length} ships; ${added} added, ${changed} changed.`)
    const audit = auditShipNames(updated)
    console.log(`Name coverage: ${audit.scopedShips} Japanese/Pan-Asian ships; ${audit.missingIdMappings.length} missing ID mappings; ${audit.untranslatedNames.length} untranslated names.`)
    for (const ship of audit.missingIdMappings) console.log(`Missing ID mapping: ${ship.id} / ${ship.english} / ${ship.chinese}`)
    for (const ship of audit.untranslatedNames) console.log(`Name needs review: ${ship.id} / ${ship.english} / ${ship.chinese}`)
    if (!values['dry-run']) console.log(destination)
  } catch (error) {
    console.error(`Ship catalog update failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exitCode = 1
  }
}
