import { useState } from 'react'
import { faClockRotateLeft, faArrowRight, faCrosshairs, faDownload } from '@fortawesome/free-solid-svg-icons'
import type { AppState } from '@aperadar/shared/types'
import { MODE_LABELS } from '@aperadar/shared/types'
import { formatPercent } from '@aperadar/shared/statistics'
import { Icon } from '@/components/Icon.js'
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item.js'
import { Card } from '@/components/ui/card.js'
import { Button, EmptyState, Badge, SearchInput } from '@/components/ui.js'

export function HistoryPage({ state, onLoad, onDemo, onExport }: { state: AppState; onLoad: (id: string) => void; onDemo: () => void; onExport: () => void }) {
  const [search, setSearch] = useState('')
  const history = state.history.filter(b => `${b.map} ${b.region} ${MODE_LABELS[b.mode] ?? b.mode}`.toLowerCase().includes(search.toLowerCase()))
  return <Card className="gap-0 overflow-hidden py-0">
    <div className="flex flex-wrap items-center gap-3 border-b p-4">
      <SearchInput label="搜索历史对局" placeholder="搜索海域、区服或模式…" value={search} onChange={event => setSearch(event.target.value)} />
      <span className="text-sm text-muted-foreground">共 {state.history.length} 场</span><Button onClick={onExport} disabled={!state.history.length}><Icon icon={faDownload} size={16} />导出记录</Button>
    </div>
    {!state.history.length ? <EmptyState icon={<Icon icon={faClockRotateLeft} size={30} />} title="每一场对局，都值得回看" action={<Button onClick={onDemo}>体验示例对局<Icon icon={faArrowRight} size={16} /></Button>}>导入真实阵容后，对局和查询结果将自动保存在这里。再次打开即可回看快照。</EmptyState>
      : !history.length ? <EmptyState icon={<Icon icon={faClockRotateLeft} size={28} />} title="没有匹配的对局">试试其他海域、区服或模式。</EmptyState>
        : <ItemGroup className="divide-y" role="list">{history.map(battle => <div key={battle.id} role="listitem"><Item asChild className="rounded-none hover:bg-accent">
          <a href="#/overview" onClick={event => { event.preventDefault(); onLoad(battle.id) }} aria-label={`回看 ${battle.map} 对局`}>
            <ItemMedia variant="icon"><Icon icon={faCrosshairs} size={22} /></ItemMedia>
            <ItemContent className="min-w-0"><ItemTitle className="min-w-0 flex-wrap [overflow-wrap:anywhere]">{battle.map}{battle.isDemo && <Badge>示例</Badge>}</ItemTitle><ItemDescription>{new Date(battle.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {battle.region} · {MODE_LABELS[battle.mode] ?? battle.mode}</ItemDescription></ItemContent>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums"><span>我方 <strong className="text-ally">{formatPercent(battle.allyWinrate)}</strong></span><span>敌方 <strong className="text-enemy">{formatPercent(battle.enemyWinrate)}</strong></span></div>
            <ItemActions><span className="hidden text-xs text-muted-foreground lg:inline">{battle.readyCount} / {battle.playerCount} 公开战绩</span><Icon icon={faArrowRight} size={16} /></ItemActions>
          </a>
        </Item></div>)}</ItemGroup>}
  </Card>
}

