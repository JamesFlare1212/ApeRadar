import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons'
import type { ShipType } from '@aperadar/shared/types'
import { Icon } from '../Icon.js'
import aircarrierIcon from '../../assets/ship-types/aircarrier.svg'
import battleshipIcon from '../../assets/ship-types/battleship.svg'
import cruiserIcon from '../../assets/ship-types/cruiser.svg'
import destroyerIcon from '../../assets/ship-types/destroyer.svg'
import submarineIcon from '../../assets/ship-types/submarine.svg'

const shipIcons: Record<Exclude<ShipType, 'Unknown'>, string> = {
  AirCarrier: aircarrierIcon, Battleship: battleshipIcon, Cruiser: cruiserIcon, Destroyer: destroyerIcon, Submarine: submarineIcon,
}
export function ShipGlyph({ type, size = 27 }: { type: ShipType; size?: number }) {
  if (type === 'Unknown') return <Icon icon={faCircleQuestion} size={size} />
  return <img className="ship-type-icon" src={shipIcons[type]} width={size} height={size} alt="" aria-hidden="true" draggable={false} />
}
