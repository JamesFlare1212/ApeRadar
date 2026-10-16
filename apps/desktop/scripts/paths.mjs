import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const desktopRoot = fileURLToPath(new URL('..', import.meta.url))
export const workspaceRoot = path.resolve(desktopRoot, '../..')
export const webRoot = path.join(workspaceRoot, 'apps/web')
