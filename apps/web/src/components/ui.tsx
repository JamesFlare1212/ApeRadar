import { useRef, useState, type ComponentProps, type ReactElement, type ReactNode, type RefObject } from 'react'
import { Info, Search, X } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button as ShadcnButton } from './ui/button.js'
import { Badge as ShadcnBadge } from './ui/badge.js'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.js'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select.js'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './ui/empty.js'
import { Spinner } from './ui/spinner.js'
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog.js'
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group.js'

type ButtonProps = ComponentProps<typeof ShadcnButton> & { busy?: boolean }

export function Button({ children, variant = 'outline', className, busy = false, ...props }: ButtonProps) {
  return <ShadcnButton type="button" {...props} variant={variant} disabled={props.disabled || busy} aria-busy={busy || props['aria-busy']} className={cn('button', className)}>{busy && <Spinner aria-hidden="true" data-icon="inline-start" />}{children}</ShadcnButton>
}

export function IconButton({ children, label, className, ...props }: ButtonProps & { label: string }) {
  return <Tooltip><TooltipTrigger asChild><Button {...props} variant="ghost" size="icon" aria-label={label} className={cn('icon-button', className)}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

export function Hint({ children, content }: { children: ReactElement; content: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent className="max-w-[min(28rem,calc(100vw-2rem))] wrap-anywhere">{content}</TooltipContent></Tooltip>
}

export function InfoHint({ label, children, text }: { label: string; children: ReactNode; text?: ReactNode }) {
  return <Hint content={children}><Button variant="ghost" size={text ? 'sm' : 'icon-xs'} className={cn(text && 'h-auto gap-1 px-0')} aria-label={label}>{text}<Info aria-hidden="true" data-icon={text ? 'inline-end' : 'inline-start'} /></Button></Hint>
}

const badgeTones = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  ally: 'bg-ally-soft text-ally',
  enemy: 'bg-enemy-soft text-enemy-text',
  elite: 'bg-elite-soft text-elite',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ children, tone = 'neutral', variant = 'secondary', className, ...props }: ComponentProps<typeof ShadcnBadge> & { tone?: keyof typeof badgeTones }) {
  return <ShadcnBadge {...props} variant={variant} className={cn('badge border-transparent', badgeTones[tone], className)}>{children}</ShadcnBadge>
}

export function Notice({ title, icon, children, role = 'note', ...props }: Omit<ComponentProps<typeof Alert>, 'title'> & { title?: ReactNode; icon?: ReactNode }) {
  return <Alert {...props} role={role}>{icon}{title && <AlertTitle>{title}</AlertTitle>}<AlertDescription className="line-clamp-none">{children}</AlertDescription></Alert>
}

export function Modal({ open, onOpenChange, title, description, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; className?: string }) {
  const wasOpen = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  if (open && !wasOpen.current) returnFocus.current = document.activeElement as HTMLElement | null
  wasOpen.current = open
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent showCloseButton={false} onCloseAutoFocus={event => {
    event.preventDefault()
    const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>('main h1')
    target?.focus({ preventScroll: true })
  }} className={cn('max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card text-card-foreground', className)}><DialogHeader className="pr-10 text-left"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><DialogClose asChild><Button variant="ghost" size="icon" className="absolute right-3 top-3" aria-label="关闭窗口"><X aria-hidden="true" data-icon="inline-start" /></Button></DialogClose>{children}</DialogContent></Dialog>
}

export function ConfirmationDialog({ open, onOpenChange, title, description, actionLabel, cancelLabel = '取消', onConfirm, focusTarget }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; actionLabel: string; cancelLabel?: string; onConfirm: () => boolean | void | Promise<boolean | void>; focusTarget?: RefObject<HTMLElement | null> }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const returnFocus = useRef<HTMLElement | null>(null)
  async function confirm() {
    setPending(true)
    setError('')
    try { if (await onConfirm() !== false) onOpenChange(false) }
    catch (error) { setError(error instanceof Error ? error.message : '操作未完成，请重试。') }
    finally { setPending(false) }
  }
  return <AlertDialog open={open} onOpenChange={value => { if (!pending) { setError(''); onOpenChange(value) } }}>
    <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card text-card-foreground" onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement | null }} onCloseAutoFocus={event => {
      event.preventDefault()
      const target = focusTarget?.current?.isConnected ? focusTarget.current : returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>('main h1')
      target?.focus({ preventScroll: true })
    }}>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      {error && <Notice role="alert" variant="destructive">{error}</Notice>}
      <AlertDialogFooter><AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel><Button variant="destructive" busy={pending} onClick={() => { void confirm() }}>{actionLabel}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}

export function SearchInput({ label, className, ...props }: ComponentProps<typeof InputGroupInput> & { label: string }) {
  return <InputGroup className={cn('min-w-40 flex-1', className)}><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput type="search" aria-label={label} {...props} /></InputGroup>
}

export function ChoiceSelect<T extends string>({ id, label, value, onValueChange, options, className, descriptionId, invalid }: { id?: string; label?: string; value: T; onValueChange: (value: T) => void; options: readonly { value: T; label: string }[]; className?: string; descriptionId?: string; invalid?: boolean }) {
  return <Select value={value} onValueChange={next => onValueChange(next as T)}><SelectTrigger id={id} data-value={value} aria-label={label} aria-describedby={descriptionId} aria-invalid={invalid} className={cn('w-full bg-card', className)}><SelectValue /></SelectTrigger><SelectContent position="popper"><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <Empty className="min-h-64"><EmptyHeader><EmptyMedia variant="icon" className="size-14 bg-brand-soft text-brand">{icon}</EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{children}</EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>
}
