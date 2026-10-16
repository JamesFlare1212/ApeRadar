import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { workspaceRoot } from './paths.mjs'

process.chdir(workspaceRoot)
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const executable = path.resolve(`release/ApeRadar-Next-${version}-x64.exe`)
const directory = path.resolve('.test-data', `packaged-${Date.now()}`)
await mkdir(directory, { recursive: true })
const environment = { ...process.env, APERADAR_DATA_DIR: directory }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(executable, ['--smoke-test'], { env: environment, stdio: 'ignore', windowsHide: true })
const timer = setTimeout(() => { child.kill(); console.error('Packaged application smoke timed out'); process.exitCode = 1 }, 60000)
const code = await new Promise(resolve => { child.on('exit', resolve); child.on('error', error => { console.error(error); resolve(1) }) })
clearTimeout(timer)
const report = JSON.parse(await readFile(path.join(directory, 'smoke-result.json'), 'utf8'))
if (code !== 0 || report.status !== 'passed') throw new Error('Packaged application smoke failed: ' + JSON.stringify(report))
const bytes = await readFile(executable)
await mkdir('artifacts', { recursive: true })
const result = { status: 'passed', executable, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), report }
await writeFile('artifacts/packaged-validation.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify({ status: result.status, bytes: result.bytes, sha256: result.sha256, result: report.result }, null, 2))
