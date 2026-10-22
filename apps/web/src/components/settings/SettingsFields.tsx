import { useId, type ComponentProps, type ReactNode } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { Icon } from '../Icon.js'
import { Card, CardContent, CardDescription, CardHeader } from '../ui/card.js'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '../ui/field.js'
import { Input } from '../ui/input.js'
import { Switch } from '../ui/switch.js'

export function SettingsCard({ icon, title, description, children }: { icon: IconDefinition; title: string; description: string; children: ReactNode }) {
  const id = useId()
  return <Card className="settings-panel" role="region" aria-labelledby={id}>
    <CardHeader className="flex flex-row items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon icon={icon} size={20} /></span><div className="min-w-0 space-y-1"><h2 id={id} className="font-semibold">{title}</h2><CardDescription>{description}</CardDescription></div></CardHeader>
    <CardContent className="space-y-6">{children}</CardContent>
  </Card>
}

export function SettingsToggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  const id = useId()
  return <Field orientation="horizontal" className="border-t pt-5"><FieldContent className="min-w-0"><FieldLabel htmlFor={id}>{label}</FieldLabel>{description && <FieldDescription id={`${id}-hint`}>{description}</FieldDescription>}</FieldContent><Switch id={id} aria-describedby={description ? `${id}-hint` : undefined} checked={checked} onCheckedChange={onChange} /></Field>
}

export function NumberField({ id, label, description, error, value, onValueChange, ...props }: Omit<ComponentProps<typeof Input>, 'onChange' | 'type'> & { id: string; label: string; description?: string; error?: string; onValueChange: (value: number) => void }) {
  const describedBy = [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return <Field data-invalid={!!error}><FieldLabel htmlFor={id}>{label}</FieldLabel><Input {...props} id={id} type="number" value={typeof value === 'number' && Number.isNaN(value) ? '' : value} aria-invalid={!!error} aria-describedby={describedBy} onChange={event => onValueChange(event.target.value === '' ? Number.NaN : Number(event.target.value))} />{description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}<FieldError id={`${id}-error`}>{error}</FieldError></Field>
}
