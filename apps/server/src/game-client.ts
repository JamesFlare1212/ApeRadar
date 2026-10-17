import { open, realpath, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { GameClientInspection } from '@aperadar/shared/game-client'
import { gameSection, readGameText } from './game-files.ts'
import { detectGameRegion, unknownRegion } from './game-region.ts'

const isDirectory = async (filename: string) => stat(filename).then(info => info.isDirectory(), () => false)

async function isGameExecutable(filename: string, require64 = false): Promise<boolean> {
  try {
    const file = await open(filename, 'r')
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size < 88) return false
      const dos = Buffer.alloc(64)
      if ((await file.read(dos, 0, dos.length, 0)).bytesRead !== dos.length || dos.readUInt16LE(0) !== 0x5A4D) return false
      const offset = dos.readUInt32LE(60)
      if (offset < 64 || offset > info.size - 24) return false
      const header = Buffer.alloc(24)
      if ((await file.read(header, 0, header.length, offset)).bytesRead !== header.length || header.readUInt32LE(0) !== 0x00004550) return false
      const machine = header.readUInt16LE(4), flags = header.readUInt16LE(22)
      return (machine === 0x8664 || (!require64 && machine === 0x014C)) && (flags & 0x0002) !== 0 && (flags & 0x2000) === 0
    } finally { await file.close() }
  } catch { return false }
}

function installedVersion(text: string): string | null {
  const section = gameSection(text, ['part_versions'])
  if (!section) return null
  for (const tag of section.matchAll(/<version\s+([^<>]+)\/\s*>/g)) {
    const attributes = Object.fromEntries([...tag[1].matchAll(/([a-z_]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))
    if (attributes.name === 'client' && /^\d+\.\d+\.\d+\.\d+\.\d+$/.test(attributes.installed ?? '')) return attributes.installed
  }
  return null
}

export async function inspectGameClient(input: string): Promise<GameClientInspection> {
  const requested = input.trim()
  const invalid = (message: string): GameClientInspection => ({ path: requested, valid: false, message, version: null, build: null, installationRealm: null, replaysAvailable: false, region: unknownRegion('请先选择有效的游戏目录') })
  if (!requested || requested.includes('\0') || !path.isAbsolute(requested)) return invalid('请选择游戏的完整安装路径')
  let root: string
  try { root = await realpath(requested) } catch { return invalid('游戏目录不存在或无法读取') }
  if (!await isGameExecutable(path.join(root, 'WorldOfWarships.exe'))) return invalid('此目录中没有有效的 WorldOfWarships.exe，请选择游戏根目录')
  let builds: string[]
  try { builds = (await readdir(path.join(root, 'bin'), { withFileTypes: true })).filter(entry => entry.isDirectory() && /^\d{1,12}$/.test(entry.name)).map(entry => entry.name).sort((a, b) => Number(b) - Number(a)) }
  catch { return invalid('未找到客户端版本目录，请先完成游戏安装') }
  let version: string | null = null
  try { version = installedVersion((await readGameText(path.join(root, 'game_info.xml'), 512 * 1024)).text) } catch { /* Steam clients need not have WGC metadata. */ }
  const installedBuild = version?.split('.').at(-1)
  if (installedBuild) builds = [installedBuild]
  let build: string | null = null, installationRealm: string | null = null
  // Only current 64-bit clients are supported. Never execute game binaries.
  for (const candidate of builds.slice(0, 32)) {
    const directory = path.join(root, 'bin', candidate)
    if (!await isGameExecutable(path.join(directory, 'bin64', 'WorldOfWarships64.exe'), true)) continue
    try {
      const config = (await readGameText(path.join(directory, 'res', 'engine_config.xml'), 2 * 1024 * 1024)).text
      installationRealm = gameSection(config, ['customization', 'currentrealm'])?.toUpperCase() ?? null
      if (!installationRealm || !['WW', 'NA', 'EU', 'ASIA', 'RU', 'CN'].includes(installationRealm)) continue
      build = candidate
      break
    } catch { /* An incomplete downloaded version must not hide other installed builds. */ }
  }
  if (!build) return invalid('未找到完整的 64 位游戏客户端，请先完成游戏安装或更新')
  const [region, replaysAvailable] = await Promise.all([detectGameRegion(root), isDirectory(path.join(root, 'replays'))])
  return { path: root, valid: true, message: '客户端目录有效', version: installedBuild === build ? version?.split('.').slice(0, 4).join('.') ?? null : null, build, installationRealm, replaysAvailable, region }
}
