import { writeFile } from 'node:fs/promises'
import { faSatelliteDish } from '@fortawesome/free-solid-svg-icons'

const [width, height, , , paths] = faSatelliteDish.icon
const glyph = (Array.isArray(paths) ? paths : [paths]).map(d => `<path d="${d}" fill="#fff"/>`).join('')
const svg = `<!-- Font Awesome Free by Fonticons, Inc. (CC BY 4.0); see THIRD_PARTY_NOTICES.txt. -->
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 512 512"><rect width="512" height="512" rx="139" fill="#14836d"/><svg x="112" y="112" width="288" height="288" viewBox="0 0 ${width} ${height}">${glyph}</svg></svg>
`
await writeFile(new URL('../public/radar.svg', import.meta.url), svg)
console.log('Generated application mark from Font Awesome Free satellite-dish')
