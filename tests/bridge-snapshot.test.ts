import { describe, expect, it, vi } from 'vitest'
import { BridgeSnapshotStore } from '../apps/web/src/lib/bridgeSnapshot.ts'
import { deferred } from './helpers.js'

const settle = () => new Promise(resolve => setImmediate(resolve))
function setup() {
  const store = new BridgeSnapshotStore<string>()
  const initial = deferred<string>(), stop = vi.fn()
  let push!: (state: string) => void
  const disconnect = store.connect(() => initial.promise, receive => { push = receive; return stop })
  return { store, initial, push, disconnect, stop }
}

describe('bridge snapshot ordering', () => {
  it.each(['resolve', 'reject'] as const)('keeps a push received before the initial read %ss', async outcome => {
    const { store, initial, push, disconnect } = setup()
    try {
      push('new battle')
      if (outcome === 'resolve') initial.resolve('old battle')
      else initial.reject(new Error('Obsolete read failed'))
      await settle()
      expect(store.getSnapshot()).toEqual({ state: 'new battle', error: '' })
    } finally { disconnect() }
  })
  it('does not let an action response undo newer player progress or settings pushes', async () => {
    const { store, initial, push, disconnect } = setup()
    try {
      initial.resolve('initial'); await settle()
      const response = deferred<string>()
      const action = store.run(() => response.promise)
      push('query loading'); push('query cancelled; new settings')
      response.resolve('query loading')
      expect(await action).toBe('query loading')
      expect(store.getSnapshot().state).toBe('query cancelled; new settings')
    } finally { disconnect() }
  })
  it('keeps the newer request when responses arrive in reverse order without a push', async () => {
    const { store, initial, disconnect } = setup()
    try {
      initial.resolve('initial'); await settle()
      const first = deferred<string>(), second = deferred<string>()
      const older = store.run(() => first.promise), newer = store.run(() => second.promise)
      second.resolve('second response'); await newer
      first.resolve('first response'); await older
      expect(store.getSnapshot().state).toBe('second response')
    } finally { disconnect() }
  })
  it('ignores responses and callbacks from a previous subscription after reconnecting', async () => {
    const { store, initial, push: oldPush, disconnect, stop } = setup()
    const actionResponse = deferred<string>()
    const oldAction = store.run(() => actionResponse.promise)
    disconnect()
    const stopNext = store.connect(async () => 'remounted', () => () => {})
    try {
      await settle()
      oldPush('old event')
      initial.resolve('old initial')
      actionResponse.resolve('old action'); await oldAction
      await settle()
      expect(stop).toHaveBeenCalledTimes(1)
      expect(store.getSnapshot().state).toBe('remounted')
    } finally { stopNext() }
  })
  it('reports an initial read failure and clears it after a successful retry', async () => {
    const { store, initial, disconnect } = setup()
    try {
      initial.reject(new Error('Bridge unavailable')); await settle()
      expect(store.getSnapshot()).toEqual({ state: null, error: 'Bridge unavailable' })
      await store.run(async () => 'retried')
      expect(store.getSnapshot()).toEqual({ state: 'retried', error: '' })
    } finally { disconnect() }
  })
  it('retains the current snapshot after a rejected or empty action response', async () => {
    const { store, initial, disconnect } = setup()
    try {
      initial.resolve('initial'); await settle()
      await expect(store.run(async () => { throw new Error('Action failed') })).rejects.toThrow('Action failed')
      await store.run(async () => null)
      expect(store.getSnapshot()).toEqual({ state: 'initial', error: '' })
    } finally { disconnect() }
  })
})
