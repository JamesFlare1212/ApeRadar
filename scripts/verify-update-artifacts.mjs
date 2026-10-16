import { readFile, access, stat } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'

// Parse the generated manifest with the same parser as the installed updater.
const desktopRequire = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const updaterRequire = createRequire(desktopRequire.resolve('electron-updater'))
const { load } = updaterRequire('js-yaml')
const root = resolve(process.argv[2] || 'release')
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const manifest = load(await readFile(resolve(root, 'latest.yml'), 'utf8'))
if (!manifest || manifest.version !== pkg.version || !Array.isArray(manifest.files) || manifest.files.length !== 1)
  throw new Error('Update manifest must describe exactly one installer for the current version')
const file = manifest.files[0]
const expected = `ApeRadar-Next-Setup-${pkg.version}-x64.exe`
if (!file || typeof file.url !== 'string' || typeof file.sha512 !== 'string')
  throw new Error('Update manifest must include an installer URL and SHA-512')
const name = decodeURIComponent(file.url)
if (basename(name) !== name || name !== expected || (manifest.path && manifest.path !== name))
  throw new Error('Update manifest must point to the NSIS installer, never the portable EXE')
const installer = resolve(root, name)
const hash = createHash('sha512')
for await (const chunk of createReadStream(installer)) hash.update(chunk)
const digest = hash.digest('base64')
if (digest !== file.sha512 || (manifest.sha512 && digest !== manifest.sha512))
  throw new Error('Installer SHA-512 does not match latest.yml')
if (file.size !== (await stat(installer)).size) throw new Error('Installer size does not match latest.yml')
await access(resolve(root, name + '.blockmap'))
await access(resolve(root, `ApeRadar-Next-${pkg.version}-x64.exe`))
console.log(`Update artifacts verified: v${pkg.version}, NSIS installer, SHA-512, size, blockmap and portable EXE.`)
