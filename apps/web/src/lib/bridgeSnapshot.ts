export interface BridgeSnapshot<T> { state: T | null; error: string }
type Subscribe<T> = (receive: (state: T) => void) => () => void

export class BridgeSnapshotStore<T> {
  private snapshot: BridgeSnapshot<T> = { state: null, error: '' }
  private listeners = new Set<() => void>()
  private lifetime: symbol | null = null
  private revision = 0
  private request = 0

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  private publish(state: T | null, error = '') {
    this.snapshot = { state, error }
    for (const listener of this.listeners) listener()
  }

  connect(read: () => Promise<T>, subscribe: Subscribe<T>): () => void {
    const lifetime = Symbol('bridge subscription')
    this.lifetime = lifetime
    const stop = subscribe(state => {
      if (this.lifetime !== lifetime) return
      this.revision++
      this.publish(state)
    })
    void this.receive(read, true).catch(() => {})
    return () => { if (this.lifetime === lifetime) this.lifetime = null; stop() }
  }

  run = <V extends T | null>(work: () => Promise<V>): Promise<V> => this.receive(work)

  private async receive<V extends T | null>(work: () => Promise<V>, reportError = false): Promise<V> {
    const lifetime = this.lifetime, revision = this.revision, request = ++this.request
    const current = () => lifetime !== null && this.lifetime === lifetime && this.revision === revision && this.request === request
    try {
      const state = await work()
      // Pushes, newer requests, and a remounted subscription supersede this response.
      if (state !== null && current()) this.publish(state)
      return state
    } catch (error) {
      if (reportError && current()) this.publish(this.snapshot.state, error instanceof Error ? error.message : String(error))
      throw error
    }
  }
}
