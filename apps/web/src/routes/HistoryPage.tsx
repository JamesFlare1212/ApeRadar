import { ArrowRight, Crosshair, HistoryIcon, SearchIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import type { AppState } from '@aperadar/shared/types'
import { MODE_LABELS } from '@aperadar/shared/types'
import { formatPercent } from '@aperadar/shared/statistics'
import { Icon } from '@/components/Icon.js'
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item.js'
import { Button, Badge, SearchInput } from '@/components/ui.js'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty.js'

export function HistoryPage({ state, onLoad, onDemo }: { state: AppState; onLoad: (id: string) => void; onDemo: () => void }) {
  const [search, setSearch] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const history = state.history.filter(b => `${b.map} ${b.region} ${MODE_LABELS[b.mode] ?? b.mode}`.toLowerCase().includes(search.toLowerCase()))
  return <section aria-label="历史对局列表" className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3 border-b pb-4">
      <SearchInput ref={searchInput} label="搜索历史对局" placeholder="搜索海域、区服或模式…" value={search} onChange={event => setSearch(event.target.value)} />
      <span className="text-sm text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">匹配 {history.length} / 共 {state.history.length} 场</span>
    </div>
    {!state.history.length ? <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><HistoryIcon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>每一场对局，都值得回看</EmptyTitle>
        <EmptyDescription>连接游戏并检测到新对局后，阵容和查询结果将自动保存在这里。再次打开即可回看快照。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><Button onClick={onDemo}>体验示例对局<Icon data-icon="inline-end" icon={ArrowRight} /></Button></EmptyContent>
    </Empty>
      : !history.length ? <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><SearchIcon aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>没有匹配的对局</EmptyTitle>
          <EmptyDescription>试试其他海域、区服或模式。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button onClick={() => { setSearch(''); searchInput.current?.focus() }}>清除搜索</Button></EmptyContent>
      </Empty>
        : <ItemGroup className="divide-y" role="list">{history.map(battle => <div key={battle.id} role="listitem"><Item asChild className="rounded-none hover:bg-accent">
          <a href="#/overview" onClick={event => { event.preventDefault(); onLoad(battle.id) }} aria-label={`回看 ${battle.map} 对局`}>
            <ItemMedia className="size-8 text-muted-foreground"><Icon icon={Crosshair} /></ItemMedia>
            <ItemContent className="min-w-0"><ItemTitle className="min-w-0 flex-wrap [overflow-wrap:anywhere]">{battle.map}{battle.isDemo && <Badge>示例</Badge>}</ItemTitle><ItemDescription>{new Date(battle.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {battle.region} · {MODE_LABELS[battle.mode] ?? battle.mode}</ItemDescription></ItemContent>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums"><span>我方 <strong className="text-ally">{formatPercent(battle.allyWinrate)}</strong></span><span>敌方 <strong className="text-enemy">{formatPercent(battle.enemyWinrate)}</strong></span></div>
            <ItemActions><span className="hidden text-xs text-muted-foreground lg:inline">{battle.readyCount} / {battle.playerCount} 公开战绩</span><Icon data-icon="inline-end" icon={ArrowRight} /></ItemActions>
          </a>
        </Item></div>)}</ItemGroup>}
  </section>
}

