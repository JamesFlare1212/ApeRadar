import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import electron from 'electron'
import { desktopRoot, workspaceRoot } from './paths.mjs'

process.chdir(workspaceRoot)

const directory = path.resolve('.test-data', `desktop-${Date.now()}`)
await mkdir(directory, { recursive: true })
const environment = { ...process.env, APERADAR_DATA_DIR: directory }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [desktopRoot, '--smoke-test'], { env: environment, stdio: 'inherit', windowsHide: true })
const timer = setTimeout(() => { child.kill(); console.error('Electron smoke timed out'); process.exitCode = 1 }, 45000)
const code = await new Promise(resolve => child.on('exit', resolve))
clearTimeout(timer)
try { console.log(await readFile(path.join(directory, 'smoke-result.json'), 'utf8')) } catch { console.error('Electron did not write a smoke report') }
if (code === 0) { await mkdir('artifacts', { recursive: true }); for (const theme of ['light', 'dark']) await copyFile(path.join(directory, `desktop-${theme}.png`), path.join('artifacts', `desktop-${theme}.png`)); await copyFile(path.join(directory, 'smoke-result.json'), 'artifacts/desktop-validation.json') }
process.exitCode = typeof code === 'number' ? code : 1
