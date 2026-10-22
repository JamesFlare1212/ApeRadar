import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateState } from '@aperadar/shared/updates'
import { bridge } from '../lib/bridge.js'

export function useUpdates() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [error, setError] = useState('')
  const revision = useRef(0)
  const active = useRef(false)
  const run = useCallback(async (work: () => Promise<UpdateState>) => {
    const startedAt = revision.current
    const value = await work()
    // A newer IPC event can arrive before the invoke response is delivered.
    if (active.current && revision.current === startedAt) { setState(value); setError('') }
    return value
  }, [])
  useEffect(() => {
    let current = true
    active.current = true
    const stop = bridge.onUpdatesChanged(value => {
      if (!active.current) return
      revision.current++
      setState(value)
      setError('')
    })
    const startedAt = revision.current
    void bridge.getUpdates().then(value => {
      if (current && revision.current === startedAt) { setState(value); setError('') }
    }).catch(reason => { if (current && revision.current === startedAt) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { current = false; active.current = false; stop() }
  }, [])
  return { state, error, run }
}
