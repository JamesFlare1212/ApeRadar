import { useState } from 'react'
import { faCircleCheck, faCircleExclamation, faRotateRight, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import type { AppState } from '@aperadar/shared/types'
import { REGION_LABELS } from '@aperadar/shared/types'
import { bridge } from '../lib/bridge.js'
import { Icon } from './Icon.js'
import { Badge, Button } from './ui.js'

export function HealthPanel({ state, notify }: { state: AppState; notify: (message: string, error?: boolean) => void }) {
  const health = state.health
  const [checking, setChecking] = useState(false)
  const busy = checking || health?.checking
  const labels = { unknown: '尚未检查', healthy: '连接正常', degraded: '部分连接异常', unavailable: '当前数据源不可用' }
  return <section className="settings-section health-section" aria-labelledby="health-heading">
    <div className="settings-panel-title"><div><h2 id="health-heading" className="settings-section-title"><Icon icon={faWaveSquare} size={17} />API 健康检查</h2><p className="settings-description">独立检查数据源的真实响应，每分钟自动更新。检查不会查询玩家战绩。</p></div><Button busy={!!busy} onClick={() => {
      setChecking(true)
      void bridge.checkApiHealth().catch(error => notify(String(error), true)).finally(() => setChecking(false))
    }}><Icon icon={faRotateRight} size={14} />立即检查</Button></div>
    <div className="health-summary" role="status"><Badge tone={health?.status === 'healthy' ? 'success' : health?.status === 'unavailable' ? 'danger' : 'neutral'}><Icon icon={health?.status === 'healthy' ? faCircleCheck : faCircleExclamation} size={12} />{busy ? '正在检查连接…' : labels[health?.status ?? 'unknown']}</Badge><span className="muted">{health?.checkedAt ? `上次检查 ${new Date(health.checkedAt).toLocaleTimeString('zh-CN')}` : '等待首次检测'}</span></div>
    {health?.message && <p className="settings-description" role="status">{health.message}</p>}
    <div className="health-list">{health?.checks.map(check => <div className="health-row" key={`${check.source}-${check.region}`}>
      <span className={`health-indicator health-${check.status}`} aria-hidden="true" />
      <div className="health-endpoint"><strong>{check.source === 'WG_PUBLIC' ? 'Wargaming' : 'Vortex'}<span>{REGION_LABELS[check.region]}</span>{check.active && <Badge tone="brand">使用中</Badge>}</strong><small title={check.endpoint}>{check.message}</small></div>
      <span className="health-latency numeric">{check.latencyMs !== null ? `${check.latencyMs} ms` : check.status === 'unsupported' ? '不支持' : check.status === 'unconfigured' ? '未配置' : '—'}</span>
    </div>)}</div>
  </section>
}
