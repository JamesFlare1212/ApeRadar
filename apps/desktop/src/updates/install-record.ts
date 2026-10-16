import { readFile, writeFile, rename, rm } from 'node:fs/promises'

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

export async function writeInstallRecord(file: string, fromVersion: string, targetVersion: string): Promise<void> {
  await writeFile(file + '.tmp', JSON.stringify({ fromVersion, targetVersion }), 'utf8')
  await rename(file + '.tmp', file)
}
