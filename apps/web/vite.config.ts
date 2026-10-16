import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = path.resolve(root, '../..')

export default defineConfig({
  root,
  base: './',
  plugins: [react(), tailwindcss(), {
    name: 'aperadar-local-development-service',
    transformIndexHtml(html, context) { return context.server ? html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';") : html },
    async configureServer(server) {
      // Transform workspace TypeScript through Vite, including constructor parameter properties.
      const { createDevApi } = await server.ssrLoadModule('@aperadar/server/dev-api') as typeof import('@aperadar/server/dev-api')
      const api = await createDevApi(path.join(workspaceRoot, 'apps/server/resources/ships.json'), path.join(workspaceRoot, '.data/web'))
      server.middlewares.use((req, res, next) => { void api.handler(req, res, next) })
      server.httpServer?.once('close', () => api.dispose())
    },
  }],
  ssr: { noExternal: ['@aperadar/server', '@aperadar/shared'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch: { ignored: ['**/.cache/**', '**/.data/**', '**/.test-data/**', '**/analysis/**', '**/ApeRadar/**', '**/release/**', '**/artifacts/**', '**/dist/**', '**/dist-electron/**', '**/build/**'] } },
  build: { target: 'es2022', sourcemap: true },
})
