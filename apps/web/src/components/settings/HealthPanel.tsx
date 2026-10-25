import { Activity, CircleAlert, CircleCheck, RefreshCw } from 'lucide-react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.js'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle, ItemActions } from '../ui/item.js'
import { useState } from 'react'
import type { AppState } from '@aperadar/shared/types'
import { REGION_LABELS } from '@aperadar/shared/types'
import { bridge } from '../../lib/bridge.js'
import { Icon } from '../Icon.js'
import { Badge, Button, InfoHint, Notice } from '../ui.js'
import { Separator } from '../ui/separator.js'
import { cn } from '../../lib/utils.js'
import { Spinner } from '../ui/spinner.js'

export function HealthPanel({ state, notify }: { state: AppState; notify: (message: string, error?: boolean) => void }) {
  const health = state.health
  const [checking, setChecking] = useState(false)
  const busy = checking || health?.checking
  const labels = { unknown: '尚未检查', healthy: '连接正常', degraded: '部分连接异常', unavailable: '当前数据源不可用' }
  return <Card className="health-section" aria-labelledby="health-heading">
    <CardHeader><CardTitle><h2 id="health-heading" className="flex items-center gap-2"><Icon icon={Activity} />API 健康检查</h2></CardTitle><CardDescription>独立检查数据源的真实响应，每分钟自动更新。检查不会查询玩家战绩。</CardDescription><CardAction><Button busy={!!busy} onClick={() => {
      setChecking(true)
      void bridge.checkApiHealth().catch(error => notify(String(error), true)).finally(() => setChecking(false))
    }}><Icon icon={RefreshCw} />立即检查</Button></CardAction></CardHeader>
    <CardContent className="flex flex-col gap-4">
    <Item role="status" size="sm" variant="muted"><ItemContent><ItemTitle><Badge tone={health?.status === 'healthy' ? 'success' : health?.status === 'unavailable' ? 'danger' : 'neutral'}>{busy ? <Spinner aria-hidden="true" /> : <Icon icon={health?.status === 'healthy' ? CircleCheck : CircleAlert} />}{busy ? '正在检查连接…' : labels[health?.status ?? 'unknown']}</Badge></ItemTitle><ItemDescription className="text-xs">{health?.checkedAt ? `上次检查 ${new Date(health.checkedAt).toLocaleTimeString('zh-CN')}` : '等待首次检测'}</ItemDescription></ItemContent></Item>
    {health?.message && <Notice role="status">{health.message}</Notice>}
    <Separator />
    <ItemGroup className="divide-y">{health?.checks.map(check => <Item role="listitem" key={`${check.source}-${check.region}`} size="sm" className="rounded-none px-0">
      <ItemMedia><Badge className={cn('size-2 p-0', check.status === 'healthy' ? 'bg-success' : check.status === 'error' ? 'bg-danger' : check.status === 'timeout' ? 'bg-enemy' : 'bg-muted-foreground')} aria-hidden="true" /></ItemMedia>
      <ItemContent className="min-w-0"><ItemTitle className="flex-wrap">{check.source === 'WG_PUBLIC' ? 'Wargaming' : 'Vortex'}<span className="text-xs font-normal text-muted-foreground">{REGION_LABELS[check.region]}</span>{check.active && <Badge tone="brand">使用中</Badge>}</ItemTitle><ItemDescription className="line-clamp-none break-words">{check.message}<InfoHint label={`查看 ${check.source} ${REGION_LABELS[check.region]} API 地址`}>{check.endpoint}</InfoHint></ItemDescription></ItemContent>
      <ItemActions className="text-xs tabular-nums text-muted-foreground">{check.latencyMs !== null ? `${check.latencyMs} ms` : check.status === 'unsupported' ? '不支持' : check.status === 'unconfigured' ? '未配置' : '—'}</ItemActions>
    </Item>)}</ItemGroup>
    </CardContent>
  </Card>
}
