import { faSatelliteDish } from '@fortawesome/free-solid-svg-icons'
import { Icon } from '../Icon.js'

export function BrandMark({ size = 37 }: { size?: number }) {
  return <span className="brand-mark" aria-hidden="true" style={{ width: size, height: size }}><Icon icon={faSatelliteDish} size={Math.round(size * .56)} /></span>
}
