import path from 'node:path'
import type { Region } from '@aperadar/shared/types'
import { isSupportedRegion } from '@aperadar/shared/types'
import type { RegionDetection, RegionEvidence } from '@aperadar/shared/game-client'
import { gameSection, readGameText } from './game-files.ts'

const LOG_MAXIMUM_AGE_MS = 24 * 60 * 60 * 1000
const REGIONS = new Set<string>(['ASIA', 'NA', 'EU', 'RU', 'CN'])

export function lastLogRegion(text: string): Region | null {
  const value = [...text.matchAll(/Selected realm:[ \t]*([^\r\n]*)/gi)].at(-1)?.[1].trim().toUpperCase()
  return value && REGIONS.has(value) ? value as Region : null
}

export function preferencesRegion(text: string): Region | null {
  const value = gameSection(text, ['scriptsPreferences', 'net_credentials', 'active_server'])?.replace(/\s+/g, ' ').toUpperCase()
  const region = value?.match(/^WOWS (ASIA|NA|EU|RU|CN)$/)?.[1]
  return region ? region as Region : null
}

export function unknownRegion(message = '尚未识别区服，请启动目标区服的游戏或手动选择'): RegionDetection {
  return { status: 'unknown', region: null, message, evidence: [] }
}

export async function detectGameRegion(gamePath: string, now = Date.now()): Promise<RegionDetection> {
  if (!gamePath.trim()) return unknownRegion('请先选择游戏目录，或手动选择区服')
  const inputs = [
    { source: 'preferences' as const, path: path.join(gamePath, 'preferences.xml'), maximum: 2 * 1024 * 1024, tail: false, parse: preferencesRegion, marker: /<active_server>/i },
    { source: 'log' as const, path: path.join(gamePath, 'profile', 'clientrunner.log'), maximum: 256 * 1024, tail: true, parse: lastLogRegion, marker: /Selected realm:/i },
  ]
  const evidence = (await Promise.all(inputs.map(async input => {
    try {
      const file = await readGameText(input.path, input.maximum, input.tail)
      const region = input.parse(file.text)
      return { source: input.source, path: input.path, modifiedAt: file.modifiedAt, region, stale: input.source === 'log' && now - Date.parse(file.modifiedAt) > LOG_MAXIMUM_AGE_MS, unrecognized: region === null && input.marker.test(file.text.replace(/<!--[\s\S]*?-->/g, '')) } satisfies RegionEvidence
    } catch { return null }
  }))).filter((item): item is RegionEvidence => item !== null)
  const usable = evidence.filter(item => item.region !== null && !item.stale)
  if (evidence.some(item => item.unrecognized && !item.stale)) return { ...unknownRegion('游戏区服记录不完整或无法识别，请启动目标区服的游戏或手动选择'), evidence }
  const regions = new Set(usable.map(item => item.region))
  if (regions.size > 1) return { status: 'conflict', region: null, message: '游戏日志与最近选择的区服不一致，请启动目标区服的游戏或手动选择', evidence }
  const region = usable[0]?.region
  if (region === 'CN') return { status: 'unsupported', region: null, message: '国服在线查询已停止支持，请选择受支持的客户端', evidence }
  if (isSupportedRegion(region)) return { status: 'detected', region, message: '已识别最近使用的区服', evidence }
  return { ...unknownRegion(evidence.some(item => item.stale) ? '游戏日志已超过 24 小时且没有可用的区服设置，请启动游戏或手动选择' : undefined), evidence }
}
