import { readFile, readdir } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Releases require a stable major.minor.patch version')
for (const directory of ['apps', 'packages']) {
  for (const entry of await readdir(new URL(`${directory}/`, root), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const filename = `${directory}/${entry.name}/package.json`
    const pkg = JSON.parse(await readFile(new URL(filename, root), 'utf8'))
    if (pkg.version !== version) throw new Error(`${filename} version ${pkg.version} must match root version ${version}`)
  }
}
const tag = process.argv[2]
if (tag && tag !== `v${version}`) throw new Error(`Release tag ${tag} must match application version v${version}`)
console.log(`Release version verified: v${version} across all workspace packages${tag ? ' and release tag' : ''}.`)
