import { faCheck, faXmark, faStar } from '@fortawesome/free-solid-svg-icons'
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons'
import type { RadarPlayer, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { Icon } from '../Icon.js'
import { IconButton } from '../ui.js'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu.js'

export function WatchMenu({ player, entry, name, onWatch }: { player: RadarPlayer; name: string; entry?: WatchEntry; onWatch: (input: WatchInput) => void }) {
  const options = [{ status: 'positive', label: '值得信赖', tone: 'success' }, { status: 'negative', label: '需要留意', tone: 'enemy' }, { status: 'suspected', label: '疑似异常', tone: 'danger' }] as const
  if (!player.accountId) return <span className="table-action-placeholder" />
  // A row action must not lock body scrolling or change the page's scrollbar compensation.
  return <DropdownMenu modal={false}><DropdownMenuTrigger asChild><IconButton label={`关注 ${name}`} className={entry ? `watch-${entry.status}` : 'muted'}><Icon icon={entry ? faStar : faStarOutline} size={17} /></IconButton></DropdownMenuTrigger><DropdownMenuContent sideOffset={5} align="end"><DropdownMenuLabel>本地关注标记</DropdownMenuLabel>{options.map(item => <DropdownMenuItem key={item.status} onSelect={() => onWatch({ region: player.region, accountId: player.accountId!, name: player.name, status: entry?.status === item.status ? null : item.status, note: entry?.note ?? '' })}><Icon icon={faStar} size={15} className={`text-${item.tone}`} /><span className="flex-1">{item.label}</span>{entry?.status === item.status && <Icon icon={faCheck} size={14} />}</DropdownMenuItem>)}{entry && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onWatch({ region: player.region, accountId: player.accountId!, name: player.name, status: null })}><Icon icon={faXmark} size={15} />移除关注</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
}
