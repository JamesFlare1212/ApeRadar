import * as Dialog from '@radix-ui/react-dialog'
import { faXmark, faCircleNotch } from '@fortawesome/free-solid-svg-icons'
import { Icon } from './Icon.js'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useRef } from 'react'

export function Button({ children, variant = 'secondary', className = '', busy = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean }) {
  return <button type="button" {...props} disabled={props.disabled || busy} className={`button button-${variant} ${className}`}>{busy && <Icon icon={faCircleNotch} spin size={16} aria-hidden="true" />}{children}</button>
}
export function IconButton({ children, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) { return <button type="button" {...props} aria-label={label} title={label} className={`icon-button ${className}`}>{children}</button> }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'ally' | 'enemy' | 'elite' | 'danger' }) { return <span className={`badge badge-${tone}`}>{children}</span> }
export function Modal({ open, onOpenChange, title, description, children, className = '' }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; className?: string }) {
  const wasOpen = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  if (open && !wasOpen.current) returnFocus.current = document.activeElement as HTMLElement | null
  wasOpen.current = open
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content onCloseAutoFocus={event => { event.preventDefault(); const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>('main h1'); target?.focus({ preventScroll: true }) }} className={`dialog-content ${className}`}><div className="dialog-top"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close asChild><IconButton label="关闭窗口"><Icon icon={faXmark} size={19} /></IconButton></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>
}
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{children}</p>{action}</div> }
