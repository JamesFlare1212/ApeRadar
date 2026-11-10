import { useEffect, useState, useSyncExternalStore } from 'react'
import { BridgeSnapshotStore } from '../lib/bridgeSnapshot.js'

export function useBridgeSnapshot<T>(read: () => Promise<T>, subscribe: (receive: (state: T) => void) => () => void) {
  const [store] = useState(() => new BridgeSnapshotStore<T>())
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => store.connect(read, subscribe), [store, read, subscribe])
  return { ...snapshot, run: store.run }
}
