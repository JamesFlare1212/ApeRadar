import { build } from 'esbuild'
import { desktopRoot } from './paths.mjs'
export const desktopBuild = () => Promise.all([
  build({ absWorkingDir: desktopRoot, entryPoints: ['src/main.ts'], outfile: 'dist-electron/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'], sourcemap: true }),
  build({ absWorkingDir: desktopRoot, entryPoints: ['src/preload.ts'], outfile: 'dist-electron/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'], sourcemap: true }),
])
if (process.argv[1]?.endsWith('build-electron.mjs')) await desktopBuild()
