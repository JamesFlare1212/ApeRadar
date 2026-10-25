import { SatelliteDish } from 'lucide-react'
import { Icon } from '../Icon.js'

export function BrandMark({ size = 37 }: { size?: number }) {
  return <span className="brand-mark" aria-hidden="true" style={{ width: size, height: size }}><Icon icon={SatelliteDish} /></span>
}
