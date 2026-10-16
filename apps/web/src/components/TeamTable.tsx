import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { faCheck, faCircleExclamation, faCircleNotch, faCircleQuestion, faEllipsis, faEyeSlash, faFlag, faXmark, faStar } from '@fortawesome/free-solid-svg-icons'
import { Icon } from './Icon.js'
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons'
import aircarrierIcon from '../assets/ship-types/aircarrier.svg'
import battleshipIcon from '../assets/ship-types/battleship.svg'
import cruiserIcon from '../assets/ship-types/cruiser.svg'
import destroyerIcon from '../assets/ship-types/destroyer.svg'
import submarineIcon from '../assets/ship-types/submarine.svg'
import type { RadarPlayer, Settings, Team, WatchEntry, WatchInput, ShipType } from '@aperadar/shared/types'
import { SHIP_LABELS } from '@aperadar/shared/types'
import { formatNumber, formatPercent, playerRate, skillLevel, SKILL_LABELS } from '@aperadar/shared/statistics'
import { IconButton } from './ui.js'

const shipIcons: Record<Exclude<ShipType, 'Unknown'>, string> = {
  AirCarrier: aircarrierIcon, Battleship: battleshipIcon, Cruiser: cruiserIcon, Destroyer: destroyerIcon, Submarine: submarineIcon,
}
export function ShipGlyph({ type, size = 27 }: { type: ShipType; size?: number }) {
  if (type === 'Unknown') return <Icon icon={faCircleQuestion} size={size} />
  return <img className="ship-type-icon" src={shipIcons[type]} width={size} height={size} alt="" aria-hidden="true" draggable={false} />
}
export function WatchMenu({ player, entry, onWatch }: { player: RadarPlayer; entry?: WatchEntry; onWatch: (input: WatchInput) => void }) {
  const options = [{ status: 'positive', label: '值得信赖', tone: 'success' }, { status: 'negative', label: '需要留意', tone: 'enemy' }, { status: 'suspected', label: '疑似异常', tone: 'danger' }] as const
  if (!player.accountId) return <span className="table-action-placeholder" />
  // A row action must not lock body scrolling or change the page's scrollbar compensation.
  return <Dropdown.Root modal={false}><Dropdown.Trigger asChild><IconButton label={`关注 ${player.name}`} className={entry ? `watch-${entry.status}` : 'muted'}><Icon icon={entry ? faStar : faStarOutline} size={17} /></IconButton></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown-menu" sideOffset={5} align="end"><Dropdown.Label className="dropdown-label">本地关注标记</Dropdown.Label>{options.map(item => <Dropdown.Item className="dropdown-item" key={item.status} onSelect={() => onWatch({ region: player.region, accountId: player.accountId!, name: player.name, status: item.status, note: entry?.note ?? '' })}><Icon icon={faStar} size={15} className={`text-${item.tone}`} /><span>{item.label}</span>{entry?.status === item.status && <Icon icon={faCheck} size={14} />}</Dropdown.Item>)}{entry && <><Dropdown.Separator className="dropdown-separator" /><Dropdown.Item className="dropdown-item" onSelect={() => onWatch({ region: player.region, accountId: player.accountId!, name: player.name, status: null })}><Icon icon={faXmark} size={15} />移除关注</Dropdown.Item></>}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>
}
export function TeamTable({ team, players, averageWinrate, settings, watchlist, search, shipFilter, onPlayer, onWatch, onRetry, querying }: { team: Team; players: RadarPlayer[]; averageWinrate: number | null; settings: Settings; watchlist: WatchEntry[]; search: string; shipFilter: string; onPlayer: (key: string) => void; onWatch: (input: WatchInput) => void; onRetry: () => void; querying: boolean }) {
  // Preserve the game's imported roster order, including while statistics update.
  const visiblePlayers = players.filter(p => (!shipFilter || p.ship.type === shipFilter) && (!search || `${p.name} ${p.ship.name} ${p.ship.nameEn} ${p.clanTag}`.toLowerCase().includes(search.toLowerCase())))
  return <section className={`team-card team-${team}`} aria-label={team === 'ally' ? '我方阵容' : '敌方阵容'}>
    <div className="team-heading"><div className="flex items-center gap-2"><span className="team-icon"><Icon icon={faFlag} size={17} /></span><h2>{team === 'ally' ? '我方阵容' : '敌方阵容'}</h2><span className={`team-winrate text-${team}`} title={`${team === 'ally' ? '我方' : '敌方'}平均${settings.winrate === 'account' ? '账号' : '加权'}胜率：${formatPercent(averageWinrate)}`} aria-label={`${team === 'ally' ? '我方' : '敌方'}平均胜率 ${formatPercent(averageWinrate)}`}>{formatPercent(averageWinrate)}</span></div><span className="text-xs muted">{team === 'ally' ? 'ALLIED TEAM' : 'OPPOSING TEAM'}</span></div>
    <table className="player-table"><thead><tr><th scope="col">舰长 / 舰船</th><th scope="col" className="winrate-column">胜率</th><th scope="col" className="damage-column" title="当前舰船累计伤害 ÷ 本舰场次">单船场均</th><th scope="col" className="battles-column">总场次</th><th scope="col"><span className="sr-only">关注操作</span><Icon icon={faEllipsis} size={17} /></th></tr></thead>
    <tbody>{visiblePlayers.map(player => {
      const level = skillLevel(player, settings)
      const watch = watchlist.find(w => w.accountId === player.accountId && w.region === player.region)
      const masked = settings.showNames ? player.name : `${player.name.slice(0, 1)}${'•'.repeat(Math.min(player.name.length - 1, 9))}`
      const damage = player.stats?.shipAvailable && player.stats.ship.battles ? player.stats.ship.damage === null ? null : player.stats.ship.damage / player.stats.ship.battles : null
      return <tr key={player.key} className={[player.isSelf && 'self-row', player.status === 'hidden' && 'player-hidden'].filter(Boolean).join(' ')}>
        <td><div className="player-identity"><span className={`ship-glyph ship-${player.ship.type}`} title={SHIP_LABELS[player.ship.type]}><ShipGlyph type={player.ship.type} /></span><button className="player-name-button" onClick={() => onPlayer(player.key)}><span className="player-name-line"><span className="player-name">{settings.showNames && player.clanTag && <span className="clan-tag">[{player.clanTag}] </span>}{masked}{player.isSelf && <span className="self-badge">你</span>}</span>{player.status === 'hidden' && <span className="player-hidden-label"><Icon icon={faEyeSlash} size={11} />战绩已隐藏</span>}</span><span className="ship-name"><span className="tier">{player.ship.tier === 11 ? <Icon icon={faStar} size={10} /> : ['','I','II','III','IV','V','VI','VII','VIII','IX','X'][player.ship.tier] ?? '?'}</span> {player.ship.name}<span className="ship-type-text"> · {SHIP_LABELS[player.ship.type]}</span></span></button></div></td>
        {player.status === 'ready' ? <><td><span className={`rate rate-${level}`}>{formatPercent(playerRate(player, settings))}</span><span className={`skill-text skill-${level}`}>{SKILL_LABELS[level]}</span></td><td className="damage-column numeric">{formatNumber(damage)}</td><td className="battles-column numeric">{formatNumber(player.stats?.overall.battles)}</td></> : player.status === 'hidden' ? <><td className="hidden-stats-cell" /><td className="damage-column" /><td className="battles-column" /></> : <><td colSpan={2} className="status-cell">{player.status === 'pending' ? <span>{querying && <Icon icon={faCircleNotch} spin size={15} />}{querying ? '正在查询…' : '等待查询'}</span> : player.status === 'bot' ? <span>AI 舰船</span> : <button onClick={onRetry} disabled={querying} className="retry-inline"><Icon icon={faCircleExclamation} size={15} />{player.status === 'not-found' ? '未找到账号' : '查询失败'}<span>重试</span></button>}</td><td className="battles-column" /></>}
        <td><WatchMenu player={player} entry={watch} onWatch={onWatch} /></td>
      </tr>
    })}</tbody></table>
    {visiblePlayers.length === 0 && <div className="table-empty">没有匹配的舰长或舰船，请调整筛选。</div>}
    <div className="team-footer"><span className="legend-dot" />{team === 'ally' ? '我方' : '敌方'}可见战绩 {players.filter(p => p.status === 'ready').length} / {players.length}<span className="ml-auto">{search || shipFilter ? `显示 ${visiblePlayers.length} 人` : '点击舰长查看详细统计'}</span></div>
  </section>
}
