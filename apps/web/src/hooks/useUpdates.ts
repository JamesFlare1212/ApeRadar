import type { UpdateState } from '@aperadar/shared/updates'
import { bridge } from '../lib/bridge.js'
import { useBridgeSnapshot } from './useBridgeSnapshot.js'

export function useUpdates() {
  return useBridgeSnapshot<UpdateState>(bridge.getUpdates, bridge.onUpdatesChanged)
}
