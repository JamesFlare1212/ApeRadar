import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import electron from 'electron'
import { desktopBuild } from './build-electron.mjs'
import path from 'node:path'
import { desktopRoot, webRoot } from './paths.mjs'

await desktopBuild()
const server = await createServer({ configFile: path.join(webRoot, 'vite.config.ts'), root: webRoot })
await server.listen()
server.printUrls()
const environment = { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173' }
delete environment.ELECTRON_RUN_AS_NODE
// Hiding the Windows process also suppresses Electron's first application window.
const desktop = spawn(electron, [desktopRoot], { cwd: desktopRoot, env: environment, stdio: 'inherit', windowsHide: false })
const close = async () => { if (!desktop.killed) desktop.kill(); await server.close() }
desktop.on('exit', async code => { await server.close(); process.exit(code ?? 0) })
process.on('SIGINT', () => { void close() })
process.on('SIGTERM', () => { void close() })
