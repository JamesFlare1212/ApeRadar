import { writeFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SatelliteDish } from 'lucide-react'

const glyph = renderToStaticMarkup(createElement(SatelliteDish, {
  x: 112, y: 112, width: 288, height: 288, color: '#fff', strokeWidth: 2,
}))
const svg = `<!-- Lucide satellite-dish (ISC); see THIRD_PARTY_NOTICES.txt. -->
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 512 512"><rect width="512" height="512" rx="139" fill="#14836d"/>${glyph}</svg>
`
await writeFile(new URL('../public/radar.svg', import.meta.url), svg)
console.log('Generated application mark from Lucide satellite-dish')
