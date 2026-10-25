import { useRef, useState } from 'react'
import { Check, Star, X } from 'lucide-react'
import type { RadarPlayer, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { cn } from '../../lib/utils.js'
import { Icon } from '../Icon.js'
import { ConfirmationDialog, IconButton } from '../ui.js'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu.js'

const options = [
  { status: 'positive', label: '值得信赖', className: 'text-success' },
  { status: 'negative', label: '需要留意', className: 'text-enemy' },
  { status: 'suspected', label: '疑似异常', className: 'text-danger' },
] as const

export function WatchMenu({ player, entry, name, onWatch }: { player: RadarPlayer; name: string; entry?: WatchEntry; onWatch: (input: WatchInput) => Promise<boolean> }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [removing, setRemoving] = useState(false)
  const [pending, setPending] = useState(false)
  if (!player.accountId) return <span className="table-action-placeholder" />

  async function save(status: WatchEntry['status'] | null) {
    setPending(true)
    try {
      return await onWatch({ region: player.region, accountId: player.accountId!, name: player.name, status, note: entry?.note ?? '' })
    } finally { setPending(false) }
  }

  return <>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><IconButton ref={trigger} label={`关注 ${name}`} disabled={pending} className={cn(entry ? `watch-${entry.status}` : 'muted')}><Icon icon={Star} className={cn(entry && 'fill-current')} /></IconButton></DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={5} align="end">
        <DropdownMenuLabel>本地关注标记</DropdownMenuLabel>
        <DropdownMenuGroup>{options.map(item => <DropdownMenuItem key={item.status} onSelect={() => {
          if (entry?.status === item.status) setRemoving(true)
          else void save(item.status)
        }}><Icon icon={Star} className={item.className} /><span className="flex-1">{item.label}</span>{entry?.status === item.status && <Icon icon={Check} />}</DropdownMenuItem>)}</DropdownMenuGroup>
        {entry && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}><Icon icon={X} />移除关注</DropdownMenuItem></DropdownMenuGroup></>}
      </DropdownMenuContent>
    </DropdownMenu>
    <ConfirmationDialog open={removing} onOpenChange={setRemoving} focusTarget={trigger} title="移除关注记录？" description="这将删除此舰长的本地标记和备注，对局历史会保留。" actionLabel="移除关注" cancelLabel="保留记录" onConfirm={() => save(null)} />
  </>
}
