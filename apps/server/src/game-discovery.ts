import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { DiscoveredGameClient, GameClientDiscovery } from '@aperadar/shared/game-client'
import { inspectGameClient } from './game-client.ts'
import { readGameText } from './game-files.ts'

interface KeyValues { [key: string]: string | KeyValues }
export interface DiscoveryOptions { programData?: string | null; steamPath?: string | null }
const execute = promisify(execFile)

// Current Steam KeyValues files use nested objects and escaped quoted strings.
// Case-insensitive keys and explicit size/depth limits avoid format assumptions.
export function parseKeyValues(text: string): KeyValues {
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Steam 安装记录过大')
  const tokens: string[] = []
  const token = /\s+|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|[{}]/gy
  let offset = text.charCodeAt(0) === 0xFEFF ? 1 : 0
  while (offset < text.length) {
    token.lastIndex = offset
    const match = token.exec(text)
    if (!match) throw new Error('Steam 安装记录格式无效')
    offset = token.lastIndex
    if (match[0].startsWith('"') || /^[{}]$/.test(match[0])) tokens.push(match[0])
    if (tokens.length > 100_000) throw new Error('Steam 安装记录条目过多')
  }
  let index = 0
  const decode = (value: string) => value.slice(1, -1).replace(/\\([\\"nrt])/g, (_, character: string) => ({ n: '\n', r: '\r', t: '\t' }[character] ?? character))
  function object(depth: number): KeyValues {
    if (depth > 16) throw new Error('Steam 安装记录嵌套过深')
    const result: KeyValues = Object.create(null) as KeyValues
    while (index < tokens.length && tokens[index] !== '}') {
      const key = tokens[index++]
      if (!key?.startsWith('"')) throw new Error('Steam 安装记录缺少键名')
      const normalized = decode(key).toLowerCase()
      if (Object.hasOwn(result, normalized)) throw new Error('Steam 安装记录包含重复键名')
      const value = tokens[index++]
      if (value === '{') {
        result[normalized] = object(depth + 1)
        if (tokens[index++] !== '}') throw new Error('Steam 安装记录不完整')
      } else if (value?.startsWith('"')) result[normalized] = decode(value)
      else throw new Error('Steam 安装记录缺少值')
    }
    return result
  }
  const result = object(0)
  if (index !== tokens.length) throw new Error('Steam 安装记录包含多余内容')
  return result
}

function objectValue(value: string | KeyValues | undefined): KeyValues { return value && typeof value === 'object' ? value : Object.create(null) as KeyValues }
function missing(error: unknown) { return error instanceof Error && 'code' in error && error.code === 'ENOENT' }
function pathKey(value: string) { const normalized = path.normalize(value); return process.platform === 'win32' ? normalized.toLowerCase() : normalized }

async function installedSteamPath(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const executable = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  // Fixed code only: no paths or renderer input are interpolated into a shell.
  const script = "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $value=[Microsoft.Win32.Registry]::GetValue('HKEY_CURRENT_USER\\Software\\Valve\\Steam','SteamPath',$null); if ($value -is [string]) { ConvertTo-Json -InputObject $value -Compress }"
  const { stdout } = await execute(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 64 * 1024 })
  if (!stdout.trim()) return null
  const value: unknown = JSON.parse(stdout)
  return typeof value === 'string' && path.isAbsolute(value) ? value : null
}

export async function discoverGameClients(options: DiscoveryOptions = {}): Promise<GameClientDiscovery> {
  const candidates = new Map<string, { path: string; sources: Set<'wgc' | 'steam'> }>()
  const warnings = new Set<string>()
  function add(value: string, source: 'wgc' | 'steam') {
    const directory = value.trim()
    if (!path.isAbsolute(directory) || directory.includes('\0') || directory.length > 1024 || candidates.size >= 64) return
    const key = pathKey(directory)
    const candidate = candidates.get(key) ?? { path: directory, sources: new Set<'wgc' | 'steam'>() }
    candidate.sources.add(source)
    candidates.set(key, candidate)
  }
  const programData = options.programData === undefined ? process.platform === 'win32' ? process.env.ProgramData ?? 'C:\\ProgramData' : null : options.programData
  if (programData) {
    try {
      const apps = path.join(programData, 'Wargaming.net', 'GameCenter', 'apps')
      const directories = (await readdir(apps, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^wows\.(ww|na|eu|asia|ru|cn)\.production$/i.test(entry.name)).slice(0, 32)
      for (const directory of directories) {
        const root = path.join(apps, directory.name)
        for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isFile()).slice(0, 64)) {
          try { add((await readGameText(path.join(root, entry.name), 4096)).text, 'wgc') }
          catch { warnings.add('部分 WGC 安装记录无法读取，可手动选择游戏目录') }
        }
      }
    } catch (error) { if (!missing(error)) warnings.add('无法读取 WGC 安装记录，可手动选择游戏目录') }
  }
  let steamPath = options.steamPath
  if (steamPath === undefined) {
    try { steamPath = await installedSteamPath() }
    catch { warnings.add('无法读取 Steam 安装位置，可手动选择游戏目录') }
  }
  if (steamPath) {
    const libraries = new Set<string>([path.join(steamPath, 'steamapps')])
    try {
      const file = await readGameText(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 2 * 1024 * 1024)
      for (const [key, value] of Object.entries(objectValue(parseKeyValues(file.text).libraryfolders)).slice(0, 64)) {
        if (!/^\d+$/.test(key)) continue
        const directory = objectValue(value).path
        if (typeof directory === 'string' && path.isAbsolute(directory)) libraries.add(path.join(directory, 'steamapps'))
      }
    } catch (error) { if (!missing(error)) warnings.add('无法读取 Steam 游戏库记录，可手动选择游戏目录') }
    for (const library of libraries) {
      try {
        const file = await readGameText(path.join(library, 'appmanifest_552990.acf'), 256 * 1024)
        const app = objectValue(parseKeyValues(file.text).appstate)
        const directory = app.installdir
        if (app.appid === '552990' && typeof directory === 'string' && directory && directory !== '.' && directory !== '..' && !/[<>:"/\\|?*\0]/.test(directory)) add(path.join(library, 'common', directory), 'steam')
      } catch (error) { if (!missing(error)) warnings.add('部分 Steam 游戏安装记录无法读取，可手动选择游戏目录') }
    }
  }
  const clients = new Map<string, DiscoveredGameClient>()
  const entries = [...candidates.values()]
  for (let offset = 0; offset < entries.length; offset += 8) {
    const batch = entries.slice(offset, offset + 8)
    const inspections = await Promise.all(batch.map(candidate => inspectGameClient(candidate.path)))
    inspections.forEach((inspection, index) => {
      if (!inspection.valid) { warnings.add(`已忽略不可用的游戏目录：${inspection.path}。${inspection.message}`); return }
      const key = pathKey(inspection.path)
      const existing = clients.get(key)
      const sources = [...new Set([...(existing?.sources ?? []), ...batch[index].sources])]
      clients.set(key, { ...inspection, sources })
    })
  }
  return { clients: [...clients.values()].sort((a, b) => a.path.localeCompare(b.path)), warnings: [...warnings] }
}
