import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { DEFAULT_API_CONFIG, mergeApiConfig, type ApiConfig } from '@aperadar/shared/api-config'

export interface RuntimeApiConfig {
  config: ApiConfig
  filePath: string
  applicationIdSource: 'environment' | 'file'
}

interface LoadOptions {
  createIfMissing?: boolean
  environment?: Record<string, string | undefined>
}

export async function loadApiConfig(defaultFile: string, options: LoadOptions = {}): Promise<RuntimeApiConfig> {
  const environment = options.environment ?? process.env
  const explicitFile = environment.APERADAR_CONFIG_FILE?.trim() || undefined
  const filePath = path.resolve(explicitFile ?? defaultFile)
  try {
    if (options.createIfMissing && !explicitFile) {
      await mkdir(path.dirname(filePath), { recursive: true })
      try { await writeFile(filePath, JSON.stringify(DEFAULT_API_CONFIG, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    const contents = await readFile(filePath, 'utf8')
    let config = mergeApiConfig(JSON.parse(contents.replace(/^\uFEFF/, '')) as unknown)
    if (environment.WG_APPLICATION_ID !== undefined) config = mergeApiConfig({ wgApplicationId: environment.WG_APPLICATION_ID }, config)
    return { config, filePath, applicationIdSource: environment.WG_APPLICATION_ID !== undefined ? 'environment' : 'file' }
  } catch (error) {
    const details = error instanceof z.ZodError ? error.issues.map(issue => `${issue.path.join('.') || 'config'}: ${issue.message}`).join(';')
      : error instanceof SyntaxError ? 'Invalid JSON; check commas, quotes, and brackets.'
        : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'The configuration file does not exist.'
          : 'The configuration file could not be read or initialized.'
    throw new Error(`API configuration error (${filePath}): ${details}`)
  }
}
