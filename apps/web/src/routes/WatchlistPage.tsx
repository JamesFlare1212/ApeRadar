import { cn } from '@/lib/utils.js'
import { Pencil, Save, SearchIcon, Star, StarIcon, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { AppState, WatchEntry, WatchInput } from '@aperadar/shared/types'
import { REGION_LABELS } from '@aperadar/shared/types'
import { Icon } from '@/components/Icon.js'
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item.js'
import { DialogFooter } from '@/components/ui/dialog.js'
import { Field, FieldLabel } from '@/components/ui/field.js'
import { Textarea } from '@/components/ui/textarea.js'
import { Button, IconButton, Badge, Modal, ChoiceSelect, SearchInput, ConfirmationDialog } from '@/components/ui.js'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty.js'

export function WatchlistPage({ state, onWatch }: { state: AppState; onWatch: (input: WatchInput) => Promise<boolean> }) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all')
  const searchInput = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<WatchEntry | null>(null), [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<WatchEntry | null>(null)
  const labels = { positive: '值得信赖', negative: '需要留意', suspected: '疑似异常' }
  const entries = state.watchlist.filter(w => (filter === 'all' || w.status === filter) && `${w.name} ${w.note} ${REGION_LABELS[w.region]}`.toLowerCase().includes(search.toLowerCase()))
  const displayName = (entry: WatchEntry) => state.settings.showNames ? entry.name : '已隐藏舰长名称'
  return <>
    <section aria-label="关注名单列表" className="flex flex-col gap-4">
      <div className="watchlist-toolbar flex flex-wrap items-center gap-3 border-b pb-4"><SearchInput ref={searchInput} label="搜索关注名单" placeholder="搜索舰长或备注…" value={search} onChange={event => setSearch(event.target.value)} /><ChoiceSelect label="关注类型" className="w-[140px] shrink-0" value={filter} onValueChange={setFilter} options={[{ value: 'all', label: '全部标记' }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} /><div className="ml-auto flex flex-wrap items-center gap-3" role="status" aria-live="polite" aria-atomic="true"><span className="text-sm text-muted-foreground">匹配 {entries.length} 位</span><Badge className="watchlist-count"><Icon icon={Star} />{state.watchlist.length} 位已关注</Badge></div></div>
      {!entries.length ? <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{state.watchlist.length ? <SearchIcon aria-hidden="true" /> : <StarIcon aria-hidden="true" />}</EmptyMedia>
          <EmptyTitle>{state.watchlist.length ? '没有匹配的舰长' : '记住值得留意的舰长'}</EmptyTitle>
          <EmptyDescription>{state.watchlist.length ? '没有找到符合当前搜索或筛选条件的舰长。' : '点击阵容中舰长右侧的星标，添加本地关注或备注。下次遇到时会显示相应标记。'}</EmptyDescription>
        </EmptyHeader>
        {state.watchlist.length > 0 && <EmptyContent><Button onClick={() => { setSearch(''); setFilter('all'); searchInput.current?.focus() }}>清除搜索与筛选</Button></EmptyContent>}
      </Empty>
        : <ItemGroup className="divide-y" role="list">{entries.map(entry => <Item role="listitem" key={`${entry.region}:${entry.accountId}`} className="items-start rounded-none">
          <ItemMedia className={cn(`size-8 watch-${entry.status}`)}><Icon icon={Star} /></ItemMedia>
          <ItemContent className="min-w-0"><ItemTitle className="min-w-0 flex-wrap [overflow-wrap:anywhere]">{displayName(entry)}<Badge tone={entry.status === 'positive' ? 'success' : entry.status === 'negative' ? 'enemy' : 'danger'}>{labels[entry.status]}</Badge></ItemTitle><ItemDescription>{REGION_LABELS[entry.region]} · {entry.accountId.startsWith('demo-') ? '示例账号' : `ID ${entry.accountId}`}</ItemDescription><ItemDescription className="line-clamp-none [overflow-wrap:anywhere]">{entry.note || '暂无备注'}</ItemDescription></ItemContent>
          <ItemActions><IconButton label={`编辑 ${displayName(entry)} 的备注`} onClick={() => { setEditing(entry); setNote(entry.note) }}><Icon icon={Pencil} /></IconButton><IconButton label={`移除 ${displayName(entry)} 的关注`} onClick={() => setRemoving(entry)}><Icon icon={Trash2} /></IconButton></ItemActions>
        </Item>)}</ItemGroup>}
    </section>
    <Modal open={!!editing} onOpenChange={open => { if (!open && !saving) setEditing(null) }} title="编辑关注备注" description={editing ? `${displayName(editing)} · ${REGION_LABELS[editing.region]}` : ''}>
      <Field><FieldLabel htmlFor="edit-watch-note">备注</FieldLabel><Textarea id="edit-watch-note" rows={4} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></Field>
      <DialogFooter><Button disabled={saving} onClick={() => setEditing(null)}>取消</Button><Button variant="default" busy={saving} onClick={() => { if (editing) { setSaving(true); void onWatch({ ...editing, note }).then(ok => { if (ok) setEditing(null) }).finally(() => setSaving(false)) } }}><Icon icon={Save} />保存备注</Button></DialogFooter>
    </Modal>
    <ConfirmationDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null) }} title="移除关注记录？" description="这将删除此舰长的本地标记和备注，对局历史会保留。" actionLabel="移除关注" cancelLabel="保留记录" onConfirm={() => removing ? onWatch({ ...removing, status: null }) : false} />
  </>
}

