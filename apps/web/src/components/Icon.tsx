import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { FontAwesomeIconProps } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

type IconProps = Omit<FontAwesomeIconProps, 'icon' | 'size'> & {
  icon: IconDefinition
  size?: number
}

export function Icon({ size = 16, style, ...props }: IconProps) {
  return <FontAwesomeIcon aria-hidden="true" focusable="false" {...props} style={{ width: size, height: size, ...style }} />
}
