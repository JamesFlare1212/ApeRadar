import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import appPackage from '../package.json'
import { removeTemp, tempDirectory } from './helpers'

const directories: string[] = []
afterEach(() => { directories.splice(0).forEach(removeTemp) })

async function artifacts() {
  const root = tempDirectory()
  directories.push(root)
  const installer = `ApeRadar-Next-Setup-${appPackage.version}-x64.exe`
  const portable = `ApeRadar-Next-${appPackage.version}-x64.exe`
  const bytes = Buffer.from('fixture installer payload')
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  const metadata = path.join(root, 'latest.yml')
  await writeFile(path.join(root, installer), bytes)
  await writeFile(path.join(root, portable), 'fixture portable payload')
  await writeFile(path.join(root, installer + '.blockmap'), 'fixture blockmap')
  await writeFile(metadata, `version: ${appPackage.version}\nfiles:\n  - url: ${installer}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${installer}\nsha512: ${sha512}\n`)
  return { root, installer, portable, metadata }
}

function verify(root: string) {
  const result = spawnSync(process.execPath, ['scripts/verify-update-artifacts.mjs', root], { encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  return { code: result.status, output: result.stdout + result.stderr }
}

describe('release artifact verification', () => {
  it('accepts a complete release with a matching installer digest and size', async () => {
    const { root } = await artifacts()
    expect(verify(root)).toMatchObject({ code: 0, output: expect.stringContaining('Update artifacts verified') })
  })

  it('rejects an update manifest pointing at the portable executable', async () => {
    const { root, installer, portable, metadata } = await artifacts()
    await writeFile(metadata, (await readFile(metadata, 'utf8')).replaceAll(installer, portable))
    expect(verify(root)).toMatchObject({ code: 1, output: expect.stringContaining('never the portable EXE') })
  })

  it('rejects a corrupted installer before a release can be published', async () => {
    const { root, installer } = await artifacts()
    await writeFile(path.join(root, installer), 'corrupted download')
    expect(verify(root)).toMatchObject({ code: 1, output: expect.stringContaining('SHA-512 does not match') })
  })

  it('rejects a stale update version and incorrect installer size', async () => {
    const { root, metadata } = await artifacts()
    const original = await readFile(metadata, 'utf8')
    await writeFile(metadata, original.replace(`version: ${appPackage.version}`, 'version: 0.0.1'))
    expect(verify(root)).toMatchObject({ code: 1, output: expect.stringContaining('current version') })
    await writeFile(metadata, original.replace(/size: \d+/, 'size: 1'))
    expect(verify(root)).toMatchObject({ code: 1, output: expect.stringContaining('size does not match') })
  })

  it('requires the blockmap and portable download alongside the installer', async () => {
    const { root, installer, portable } = await artifacts()
    await rm(path.join(root, installer + '.blockmap'))
    expect(verify(root).code).toBe(1)
    await writeFile(path.join(root, installer + '.blockmap'), 'fixture blockmap')
    await rm(path.join(root, portable))
    expect(verify(root).code).toBe(1)
  })

  it('accepts a matching stable tag and rejects a tag for a different version', () => {
    const command = ['scripts/verify-release-version.mjs']
    expect(spawnSync(process.execPath, [...command, `v${appPackage.version}`], { windowsHide: true }).status).toBe(0)
    expect(spawnSync(process.execPath, [...command, 'v0.0.1'], { windowsHide: true }).status).toBe(1)
  })
})
