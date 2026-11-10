import { spawn } from 'node:child_process'
import { app } from 'electron'

export async function validateSingleInstance() {
  const environment: NodeJS.ProcessEnv = { ...process.env, APERADAR_DATA_DIR: app.getPath('userData') }
  delete environment.ELECTRON_RUN_AS_NODE
  const args = [...app.isPackaged ? [] : [app.getAppPath()], '--smoke-test', '--smoke-secondary']
  const child = spawn(process.execPath, args, { env: environment, windowsHide: true, stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('The secondary instance did not exit promptly')) }, 10_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`The secondary instance reached application startup (exit ${code})`))
    })
  })
  return { secondaryProcessExited: true, sharedDataStartupBlocked: true }
}
