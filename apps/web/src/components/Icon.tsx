import type { LucideIcon, LucideProps } from 'lucide-react'

type IconProps = LucideProps & { icon: LucideIcon }

export function Icon({ icon: Glyph, size = 16, ...props }: IconProps) {
  return <Glyph size={size} aria-hidden="true" focusable="false" data-icon="inline-start" {...props} />
}
