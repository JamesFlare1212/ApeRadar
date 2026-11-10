export class ResponseSizeError extends Error {}

export function cancelResponse(response: Response): void { void response.body?.cancel().catch(() => {}) }

export function withAbort<T>(work: () => Promise<T>, signal: AbortSignal, onLate?: (value: T) => void): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    let aborted = false
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => { aborted = true; cleanup(); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    let task: Promise<T>
    try { task = work() }
    catch (error) { cleanup(); reject(error); return }
    void task.then(value => {
      cleanup()
      if (aborted) onLate?.(value)
      else resolve(value)
    }, error => { cleanup(); if (!aborted) reject(error) })
  })
}

export async function readResponseText(response: Response, signal: AbortSignal, maximumBytes: number, oversizedMessage: string): Promise<string> {
  if (signal.aborted) { cancelResponse(response); signal.throwIfAborted() }
  if (Number(response.headers.get('content-length')) > maximumBytes) {
    cancelResponse(response)
    throw new ResponseSizeError(oversizedMessage)
  }
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = '', size = 0, complete = false
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      const { value, done } = await withAbort(() => reader.read(), signal)
      signal.throwIfAborted()
      if (done) { complete = true; break }
      size += value.byteLength
      if (size > maximumBytes) throw new ResponseSizeError(oversizedMessage)
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    signal.removeEventListener('abort', cancel)
    if (!complete) cancel()
    reader.releaseLock()
  }
}
