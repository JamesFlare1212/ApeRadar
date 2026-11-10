import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const pendingWrites = new Map<string, Promise<void>>()

export async function readInstallRecord(file: string, currentVersion: string): Promise<string | null> {
  try {
    const record: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (typeof record === 'object' && record !== null && 'fromVersion' in record && record.fromVersion === currentVersion &&
      'targetVersion' in record && typeof record.targetVersion === 'string' && record.targetVersion !== currentVersion) return record.targetVersion
    await rm(file, { force: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Could not read update install record:', error)
  }
  return null
}

export function writeInstallRecord(file: string, fromVersion: string, targetVersion: string): Promise<void> {
  const resolved = path.resolve(file)
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved
  // Windows can reject concurrent renames even when each writer has its own temp file.
  const write = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const temporary = `${resolved}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify({ fromVersion, targetVersion }), { encoding: 'utf8', flag: 'wx' })
      await rename(temporary, resolved)
    } finally { await rm(temporary, { force: true }) }
  })
  const pending = write.finally(() => { if (pendingWrites.get(key) === pending) pendingWrites.delete(key) })
  pendingWrites.set(key, pending)
  return pending
}
