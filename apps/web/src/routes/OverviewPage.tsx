import { lazy, Suspense } from 'react'
import { faArrowRight, faChartLine, faCircleExclamation, faCircleInfo, faCopy, faDownload, faFolderOpen, faPause } from '@fortawesome/free-solid-svg-icons'
import type { AppState, Settings, WatchInput } from '@aperadar/shared/types'
import { teamSummary } from '@aperadar/shared/statistics'
import { Icon } from '@/components/Icon.js'
import { TeamTable } from '@/components/battle/TeamTable.js'
import { Badge, Button, EmptyState, Notice } from '@/components/ui.js'
import { Card } from '@/components/ui/card.js'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item.js'
import { Progress } from '@/components/ui/progress.js'
import { Skeleton } from '@/components/ui/skeleton.js'
import { Spinner } from '@/components/ui/spinner.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js'

const DistributionChart = lazy(() => import('@/components/battle/DistributionChart.js').then(module => ({ default: module.DistributionChart })))

export function OverviewPage({ state, onPlayer, onWatch, onRetry, onCancel, onImport, onExport, onSummary, onWinrateChange }: {
  state: AppState
  onPlayer: (key: string) => void
  onWatch: (input: WatchInput) => void
  onRetry: () => void
  onCancel: () => void
  onImport: () => void
  onExport: () => void
  onSummary: () => void
  onWinrateChange: (value: Settings['winrate']) => void
}) {
  const { battle, settings, query } = state
  if (!battle) return <Card><EmptyState icon={<Icon icon={faChartLine} size={28} />} title="载入你的第一场阵容" action={<Button onClick={onImport}><Icon icon={faFolderOpen} size={16} />打开阵容</Button>}>连接游戏或导入 tempArenaInfo.json、.wowsreplay 文件后，即可查看双方战绩。</EmptyState></Card>
  const loading = query.status === 'loading'
  const failed = battle.players.filter(player => ['unavailable', 'not-found'].includes(player.status) || player.error).length
  return <>
    {loading && <Item role="status" variant="outline" className="mb-4 flex-nowrap"><ItemContent className="min-w-0 gap-2"><ItemTitle><Spinner aria-hidden="true" />{query.message}</ItemTitle><Progress value={query.done} max={query.total || 1} aria-label="战绩查询进度" /></ItemContent><ItemActions><Button variant="ghost" size="sm" onClick={onCancel}><Icon icon={faPause} size={14} />取消</Button></ItemActions></Item>}
    {failed > 0 && !loading && <Notice role="status" className="mb-4 border-enemy/30 bg-enemy-soft" icon={<Icon icon={faCircleExclamation} size={16} />}><p>{failed} 位舰长的数据尚未补齐，其他结果已保留。</p><Button variant="link" className="h-auto p-0" onClick={onRetry}>重试失败数据<Icon icon={faArrowRight} size={14} /></Button></Notice>}
    <Tabs value={settings.winrate} onValueChange={value => { if (value !== settings.winrate) onWinrateChange(value as Settings['winrate']) }} className="gap-0">
      <div className="roster-toolbar">
        <div className="flex flex-wrap items-center gap-3"><h2>双方阵容</h2><TabsList aria-label="胜率显示口径"><TabsTrigger value="account">账号胜率</TabsTrigger><TabsTrigger value="weighted">加权胜率</TabsTrigger></TabsList>{battle.isDemo && <Badge>示例对局</Badge>}</div>
      </div>
      <TabsContent value={settings.winrate}>
        <div className="teams-grid">{(['ally', 'enemy'] as const).map(team => <TeamTable key={team} team={team} averageWinrate={teamSummary(battle, team, settings).winrate} players={battle.players.filter(player => player.team === team)} settings={settings} watchlist={state.watchlist} onPlayer={onPlayer} onWatch={onWatch} onRetry={onRetry} querying={loading} />)}</div>
      </TabsContent>
    </Tabs>
    <div className="roster-actions"><p><Icon icon={faCircleInfo} size={13} />当前展示累计随机战战绩 · 隐藏与查询失败分别标记</p><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={onExport}><Icon icon={faDownload} size={16} />导出 CSV</Button><Button onClick={onSummary}><Icon icon={faCopy} size={16} />生成文字摘要</Button></div></div>
    <Suspense fallback={<Skeleton className="h-[420px] w-full" />}><DistributionChart battle={battle} settings={settings} /></Suspense>
  </>
}
