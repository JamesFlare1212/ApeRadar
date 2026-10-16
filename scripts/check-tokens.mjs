import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const source = await readFile('apps/web/assets/design-tokens.css', 'utf8')
const paletteSource = await readFile('apps/web/assets/palette-tokens.css', 'utf8')
const starts = [source.indexOf('/* Primitive'), source.indexOf('/* Semantic'), source.indexOf('/* Component')]
if (starts.some(n => n < 0)) throw new Error('Missing token layer')
const collect = value => Object.fromEntries([...value.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
const darkAt = source.indexOf(':root.dark')
const tokens = { source: 'apps/web/assets/design-tokens.css', description: 'Machine-readable index; regenerate with pnpm tokens:check. CSS is the source of truth.',
  primitive: collect(source.slice(starts[0], starts[1])), semantic: collect(source.slice(starts[1], darkAt)), dark: collect(source.slice(darkAt, starts[2])), component: collect(source.slice(starts[2])),
  paletteSource: 'apps/web/assets/palette-tokens.css',
  palettes: [...paletteSource.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), tokens: collect(match[2]) })) }
const errors = []
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) await scan(filename)
    else if (/\.(tsx|css)$/.test(filename)) {
      const text = await readFile(filename, 'utf8')
      if (/#[0-9a-fA-F]{3,8}\b/.test(text)) errors.push(`${filename}: hardcoded color outside primitive layer`)
      if (/var\(--p-teal-/.test(text)) errors.push(`${filename}: use palette accent or semantic success tokens instead of a fixed green primitive`)
    }
  }
}
await scan('apps/web/src')
if (errors.length) throw new Error(errors.join('\n'))
await writeFile('apps/web/assets/design-tokens.json', JSON.stringify(tokens, null, 2) + '\n')
console.log(`Three-layer tokens checked: ${Object.keys(tokens.primitive).length} primitive, ${Object.keys(tokens.semantic).length} semantic, ${Object.keys(tokens.component).length} component; no raw hex in UI components.`)
