import type { Region, SupportedRegion } from './types.ts'

export interface RegionEvidence {
  source: 'preferences' | 'log'
  path: string
  modifiedAt: string
  region: Region | null
  stale: boolean
  unrecognized: boolean
}
export interface RegionDetection {
  status: 'detected' | 'unknown' | 'conflict' | 'unsupported'
  region: SupportedRegion | null
  message: string
  evidence: RegionEvidence[]
}
export interface GameClientInspection {
  path: string
  valid: boolean
  message: string
  version: string | null
  build: string | null
  installationRealm: string | null
  replaysAvailable: boolean
  region: RegionDetection
}
export interface DiscoveredGameClient extends GameClientInspection {
  sources: ('wgc' | 'steam')[]
}
export interface GameClientDiscovery {
  clients: DiscoveredGameClient[]
  warnings: string[]
}
