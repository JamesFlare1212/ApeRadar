import type { LucideIcon } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { Icon } from '../Icon.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.js'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '../ui/field.js'
import { Input } from '../ui/input.js'
import { Switch } from '../ui/switch.js'
import { Separator } from '../ui/separator.js'

export function SettingsCard({ icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  const id = useId()
  return <Card className="settings-panel" role="region" aria-labelledby={id}>
    <CardHeader className="flex flex-row items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon icon={icon} /></span><div className="flex min-w-0 flex-col gap-1"><CardTitle><h2 id={id}>{title}</h2></CardTitle><CardDescription>{description}</CardDescription></div></CardHeader>
    <CardContent><FieldGroup className="gap-6">{children}</FieldGroup></CardContent>
  </Card>
}

export function SettingsToggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  const id = useId()
  return <><Separator /><Field orientation="horizontal"><FieldContent className="min-w-0"><FieldLabel htmlFor={id}>{label}</FieldLabel>{description && <FieldDescription id={`${id}-hint`}>{description}</FieldDescription>}</FieldContent><Switch id={id} aria-describedby={description ? `${id}-hint` : undefined} checked={checked} onCheckedChange={onChange} /></Field></>
}

export function NumberField({ id, label, description, error, value, onValueChange, ...props }: Omit<ComponentProps<typeof Input>, 'onChange' | 'type'> & { id: string; label: string; description?: string; error?: string; onValueChange: (value: number) => void }) {
  const describedBy = [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return <Field data-invalid={!!error} data-disabled={props.disabled || undefined}><FieldLabel htmlFor={id}>{label}</FieldLabel><Input {...props} id={id} type="number" value={typeof value === 'number' && Number.isNaN(value) ? '' : value} aria-invalid={!!error} aria-describedby={describedBy} onChange={event => onValueChange(event.target.value === '' ? Number.NaN : Number(event.target.value))} />{description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}<FieldError id={`${id}-error`}>{error}</FieldError></Field>
}
