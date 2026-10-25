import { CircleAlert, CircleCheck, FolderOpen, RefreshCw, Search } from 'lucide-react'
import { Field, FieldLabel, FieldDescription, FieldError } from '../ui/field.js'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle, ItemMedia, ItemActions } from '../ui/item.js'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.js'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '../ui/input-group.js'
import { Spinner } from '../ui/spinner.js'
import { cn } from '../../lib/utils.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameClientDiscovery, GameClientInspection, RegionDetection } from '@aperadar/shared/game-client'
import { REGION_LABELS } from '@aperadar/shared/types'
import type { Settings } from '@aperadar/shared/types'
import { bridge } from '../../lib/bridge.js'
import { Badge, Button, Hint, Notice } from '../ui.js'
import { Icon } from '../Icon.js'

function regionLabel(detection: RegionDetection) {
  return detection.region ? `${REGION_LABELS[detection.region]} · ${detection.region}` : detection.status === 'conflict' ? '区服信息不一致' : detection.status === 'unsupported' ? '区服暂不支持' : '尚未识别区服'
}

export function GameClientSettings({ gamePath, change }: { gamePath: string; change: (patch: Partial<Settings>) => void }) {
  const [discovery, setDiscovery] = useState<GameClientDiscovery | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryError, setDiscoveryError] = useState('')
  const [inspection, setInspection] = useState<{ input: string; client: GameClientInspection } | null>(null)
  const [inspectionError, setInspectionError] = useState('')
  const [checking, setChecking] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const latestPath = useRef(gamePath)
  latestPath.current = gamePath
  const discoveryRevision = useRef(0)
  const discover = useCallback(async () => {
    const revision = ++discoveryRevision.current
    setDiscovering(true)
    setDiscoveryError('')
    try {
      const result = await bridge.discoverGameClients()
      if (revision !== discoveryRevision.current) return
      setDiscovery(result)
      if (!latestPath.current.trim() && result.clients.length === 1) change({ gamePath: result.clients[0].path })
    } catch (error) { if (revision === discoveryRevision.current) setDiscoveryError(error instanceof Error ? error.message : '自动查找失败，请重试或手动选择目录') }
    finally { if (revision === discoveryRevision.current) setDiscovering(false) }
  }, [change])
  useEffect(() => { void discover(); return () => { discoveryRevision.current++ } }, [discover])
  useEffect(() => {
    let active = true
    setInspection(null)
    setInspectionError('')
    setChecking(!!gamePath.trim())
    if (!gamePath.trim()) return
    const timer = setTimeout(() => {
      void bridge.inspectGameClient(gamePath).then(client => { if (active) setInspection({ input: gamePath, client }) })
        .catch(() => { if (active) setInspectionError('无法检查游戏目录，请重试') })
        .finally(() => { if (active) setChecking(false) })
    }, 350)
    return () => { active = false; clearTimeout(timer) }
  }, [gamePath, refresh])
  const client = inspection?.input === gamePath ? inspection.client : null
  const discoveryMessage = discoveryError || (discovery && discovery.clients.length === 0 ? '未找到已安装的客户端，请手动选择游戏目录。' : '')
  const pathIssue = inspectionError || (client?.valid === false ? client.message : '')
  const selected = (value: string) => value.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() === gamePath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
  return <div className="game-client-settings">
    <Item className="px-0 pt-0"><ItemContent><ItemTitle><h3>连接游戏客户端</h3></ItemTitle><ItemDescription>自动查找已安装的游戏，也可以手动选择目录。</ItemDescription></ItemContent><ItemActions><Button busy={discovering} onClick={() => { void discover() }}><Icon icon={Search} />{discovering ? '正在查找' : '重新查找'}</Button></ItemActions></Item>
    {discovery && discovery.clients.length > 0 && <ItemGroup className="mb-4 gap-2" aria-label="发现的游戏客户端">{discovery.clients.map(candidate => <Item role="listitem" variant="outline" key={candidate.path} className={cn(selected(candidate.path) && 'border-primary bg-primary/5')}>
      <ItemMedia variant="icon"><Icon icon={selected(candidate.path) ? CircleCheck : FolderOpen} /></ItemMedia><ItemContent className="min-w-0"><ItemTitle className="flex-wrap">{candidate.sources.map(source => source === 'wgc' ? 'WGC' : 'Steam').join(' / ')}<span className="text-xs font-normal text-muted-foreground">{candidate.version ? `版本 ${candidate.version}` : `版本目录 ${candidate.build}`}</span></ItemTitle><ItemDescription className="line-clamp-none break-all">{candidate.path}</ItemDescription><Badge tone={candidate.region.region ? 'success' : 'neutral'}>{regionLabel(candidate.region)}</Badge></ItemContent><ItemActions><Button size="sm" aria-pressed={selected(candidate.path)} onClick={() => change({ gamePath: candidate.path })}>{selected(candidate.path) ? '已选择' : '选择'}</Button></ItemActions>
    </Item>)}</ItemGroup>}
    {(discoveryMessage || !!discovery?.warnings.length) && <Notice role={discoveryError ? 'alert' : 'status'} variant={discoveryError ? 'destructive' : 'default'} className="mb-4" icon={<Icon icon={CircleAlert} />}>{discoveryMessage && <p>{discoveryMessage}</p>}{discovery?.warnings.map(warning => <p key={warning}>{warning}</p>)}</Notice>}
    <Field className="mb-5" data-invalid={!!pathIssue}><FieldLabel htmlFor="game-path">游戏目录</FieldLabel><InputGroup><InputGroupInput aria-describedby="game-path-status" id="game-path" value={gamePath} maxLength={1024} placeholder="例如 D:\Games\World_of_Warships" aria-invalid={!!pathIssue} onChange={event => change({ gamePath: event.target.value })} /><InputGroupAddon align="inline-end">{bridge.desktop && <Hint content="浏览游戏目录"><InputGroupButton size="sm" className="max-[600px]:size-8 max-[600px]:p-0" aria-label="浏览游戏目录" onClick={() => {
      void bridge.chooseGamePath().then(value => { if (value) change({ gamePath: value }) }).catch(() => setInspectionError('无法打开目录选择器，请手动填写路径'))
    }}><Icon icon={FolderOpen} /><span className="hidden min-[600px]:inline">浏览</span></InputGroupButton></Hint>}<Hint content={!gamePath.trim() ? '请先填写或选择游戏目录' : checking ? '正在验证游戏目录和区服' : '重新检查游戏目录和区服'}><span className="inline-flex" tabIndex={!gamePath.trim() || checking ? 0 : undefined} aria-disabled={!gamePath.trim() || checking || undefined}><InputGroupButton size="sm" className="max-[600px]:size-8 max-[600px]:p-0" disabled={!gamePath.trim() || checking} aria-busy={checking} aria-label="重新检查游戏目录和区服" onClick={() => setRefresh(value => value + 1)}>{checking ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <Icon icon={RefreshCw} />}<span className="hidden min-[600px]:inline">检查</span></InputGroupButton></span></Hint></InputGroupAddon></InputGroup>
      {pathIssue ? <FieldError id="game-path-status">{pathIssue}</FieldError> : <FieldDescription id="game-path-status" role="status">{checking ? '正在验证客户端并识别区服…' : client?.message || '请选择包含 WorldOfWarships.exe 的游戏根目录。'}</FieldDescription>}
    </Field>
    {client?.valid && <Alert className={cn('game-region-result', client.region.region && 'detected')} role="status" aria-atomic="true">
      <Icon icon={client.region.region ? CircleCheck : CircleAlert} /><div><AlertTitle><strong>{regionLabel(client.region)}</strong></AlertTitle><AlertDescription><p>{client.region.message}</p><div className="game-region-evidence">{client.region.evidence.filter(item => item.region !== null).map(item => <span key={item.source}>{item.source === 'preferences' ? '游戏偏好设置' : '启动日志'} · {item.region}{item.stale ? ' · 已过期' : ''} · {new Date(item.modifiedAt).toLocaleString('zh-CN')}</span>)}</div>{!client.replaysAvailable && <p>游戏尚未创建回放目录，监测会在游戏生成阵容后自动载入。</p>}</AlertDescription></div>
    </Alert>}
  </div>
}
