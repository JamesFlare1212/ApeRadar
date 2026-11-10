import { describe, expect, it, vi } from 'vitest'
import { WargamingApi } from '@aperadar/server/api'
import { probeApiHealth } from '@aperadar/server/health'
import { deferred, settings } from './helpers.js'

const turn = () => new Promise(resolve => setImmediate(resolve))

describe('HTTP cancellation independent of the transport', () => {
  it.each(['player', 'health'] as const)('aborts a stalled %s response body even if its stream ignores the signal', async kind => {
    const started = deferred<void>(), cleanup = deferred<void>(), controller = new AbortController(), cancel = vi.fn(() => cleanup.promise)
    const streams: ReadableStreamDefaultController<Uint8Array>[] = []
    const fetcher: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(stream) { streams.push(stream); stream.enqueue(new TextEncoder().encode('{"status":"ok","data":')) },
      pull() { started.resolve() }, cancel,
    }, { highWaterMark: 0 }))
    let outcome: unknown
    const work = kind === 'player'
      ? new WargamingApi({ ...settings(), retryAttempts: 0 }, { fetcher, spacing: 0 }).json('https://fixture.invalid/stalled', controller.signal)
      : probeApiHealth(settings(), ['ASIA'], controller.signal, { fetcher })
    const pending = work.then(value => { outcome = value }, error => { outcome = error })
    try {
      await started.promise; controller.abort(); await turn()
      expect(outcome).toMatchObject({ name: 'AbortError' })
      expect(cancel).toHaveBeenCalled()
    } finally { cleanup.resolve(); for (const stream of streams) { try { stream.close() } catch { /* Already cancelled. */ } }; await pending }
  })

  it.each(['player', 'health'] as const)('enforces the %s timeout while reading a stalled body', async kind => {
    const started = deferred<void>(), timeout = new AbortController(), streams: ReadableStreamDefaultController<Uint8Array>[] = []
    const clock = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    const fetcher: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(stream) { streams.push(stream) }, pull() { started.resolve() },
    }, { highWaterMark: 0 }))
    let outcome: unknown
    const work = kind === 'player'
      ? new WargamingApi({ ...settings(), retryAttempts: 0 }, { fetcher, spacing: 0 }).json('https://fixture.invalid/stalled', new AbortController().signal)
      : probeApiHealth(settings(), ['ASIA'], new AbortController().signal, { fetcher })
    const pending = work.then(value => { outcome = value }, error => { outcome = error })
    try {
      await started.promise; timeout.abort(new DOMException('Fixture timeout', 'TimeoutError')); await turn()
      if (kind === 'player') expect(outcome).toMatchObject({ name: 'TimeoutError' })
      else expect(outcome).toMatchObject({ status: 'unavailable', checking: false, checks: [{ status: 'timeout' }, { status: 'timeout' }] })
    } finally { for (const stream of streams) { try { stream.close() } catch { /* Already cancelled. */ } }; await pending; clock.mockRestore() }
  })

  it.each(['player', 'health'] as const)('does not wait for an uncooperative rejected %s body to finish cancellation', async kind => {
    const cancelled = deferred<void>(), cleanup = deferred<void>()
    const fetcher: typeof fetch = async () => new Response(new ReadableStream({ cancel() { cancelled.resolve(); return cleanup.promise } }), { status: 503 })
    let outcome: unknown
    const work = kind === 'player'
      ? new WargamingApi({ ...settings(), retryAttempts: 0 }, { fetcher, spacing: 0 }).json('https://fixture.invalid/rejected', new AbortController().signal)
      : probeApiHealth(settings(), ['ASIA'], new AbortController().signal, { fetcher })
    const pending = work.then(value => { outcome = value }, error => { outcome = error })
    try {
      await cancelled.promise; await turn()
      if (kind === 'player') expect(outcome).toBeInstanceOf(Error)
      else expect(outcome).toMatchObject({ status: 'unavailable', checks: [{ failure: 'http' }, { failure: 'http' }] })
    } finally { cleanup.resolve(); await pending }
  })

  it('rejects an aborted fetch immediately and cancels its late response', async () => {
    const started = deferred<void>(), response = deferred<Response>(), controller = new AbortController(), cancel = vi.fn()
    const fetcher: typeof fetch = async () => { started.resolve(); return response.promise }
    const api = new WargamingApi({ ...settings(), retryAttempts: 0 }, { fetcher, spacing: 0 })
    let outcome: unknown
    const pending = api.json('https://fixture.invalid/late', controller.signal).then(value => { outcome = value }, error => { outcome = error })
    try {
      await started.promise; controller.abort(); await turn()
      expect(outcome).toMatchObject({ name: 'AbortError' })
    } finally {
      let late!: ReadableStreamDefaultController<Uint8Array>
      response.resolve(new Response(new ReadableStream({ start(stream) { late = stream }, cancel })))
      await turn()
      try { late.close() } catch { /* Cancelled by the abandoned fetch. */ }
      await pending; await turn()
    }
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
