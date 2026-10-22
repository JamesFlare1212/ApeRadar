import type { UpdateState } from './updates'
import type { GameClientDiscovery, GameClientInspection } from './game-client.ts'

export type Region = 'ASIA' | 'NA' | 'EU' | 'RU' | 'CN'
// CN remains readable in existing local snapshots and watch records.
export const SUPPORTED_REGIONS = ['ASIA', 'NA', 'EU', 'RU'] as const
export type SupportedRegion = typeof SUPPORTED_REGIONS[number]
export function isSupportedRegion(value: unknown): value is SupportedRegion {
  return SUPPORTED_REGIONS.some(region => region === value)
}
export type Team = 'ally' | 'enemy'
export type ColorPalette = 'graphite' | 'cyan' | 'orange' | 'violet' | 'forest' | 'ocean'
export type WatchStatus = 'positive' | 'negative' | 'suspected'
export type PlayerStatus = 'pending' | 'ready' | 'hidden' | 'unavailable' | 'not-found' | 'bot'
export type ShipType = 'AirCarrier' | 'Battleship' | 'Cruiser' | 'Destroyer' | 'Submarine' | 'Unknown'

export interface Ship {
  id: string; name: string; nameEn: string; type: ShipType; tier: number; nation: string
}
export interface CombatStats { battles: number; wins: number; damage: number | null; xp: number | null }
export interface PlayerStats {
  overall: CombatStats; solo: CombatStats; div2: CombatStats; div3: CombatStats
  ship: CombatStats; shipSolo: CombatStats; shipDiv2: CombatStats; shipDiv3: CombatStats
  karma: number | null; shipAvailable: boolean
}
export interface RadarPlayer {
  key: string; accountId: string | null; name: string; region: Region; team: Team; isSelf: boolean
  ship: Ship; clanTag: string; clanId: string | null; status: PlayerStatus
  stats: PlayerStats | null; error: string | null; fetchedAt: string | null; cached: boolean
}
export interface Battle {
  id: string; sourceName: string; isDemo: boolean; importedAt: string; startedAt: string
  mode: string; map: string; players: RadarPlayer[]
}
export interface Settings {
  gamePath: string; region: SupportedRegion | 'AUTO'; secondaryRegion: SupportedRegion; secondaryEnabled: boolean
  api: 'VORTEX' | 'WG_PUBLIC'; wgApplicationId: string
  theme: 'light' | 'dark' | 'system'; winrate: 'account' | 'weighted'; showNames: boolean
  lightPalette: ColorPalette; darkPalette: ColorPalette
  fontFamily: string; fontSize: number
  autoQuery: boolean; retryAttempts: number; cacheMinutes: number
  apeThreshold: number; unicumThreshold: number; minUnicumBattles: number; minApeBattles: number
  weights: { solo: number; div2: number; div3: number; shipMax: number; shipBattles: number }
  textTemplate: string; excludeSelf: boolean
}
export interface WatchEntry {
  region: Region; accountId: string; name: string; status: WatchStatus; note: string; updatedAt: string
}
export interface HistoryEntry {
  id: string; map: string; mode: string; startedAt: string; isDemo: boolean; region: string
  playerCount: number; readyCount: number; allyWinrate: number | null; enemyWinrate: number | null
}
export interface Activity { id: string; time: string; level: 'info' | 'success' | 'warning' | 'error'; message: string }
export type ApiSource = Settings['api']
export interface ApiHealthCheck {
  source: ApiSource; region: Region; endpoint: string; active: boolean; ok: boolean
  status: 'healthy' | 'error' | 'timeout' | 'unconfigured' | 'unsupported'
  latencyMs: number | null; httpStatus: number | null; message: string
  failure: 'http' | 'api' | 'invalid-response' | 'network' | 'timeout' | null
}
export interface ApiHealth {
  status: 'unknown' | 'healthy' | 'degraded' | 'unavailable'; checking: boolean
  checkedAt: string | null; intervalMs: number; checks: ApiHealthCheck[]; message: string | null
}
export interface AppState {
  settings: Settings; battle: Battle | null; watchlist: WatchEntry[]; history: HistoryEntry[]
  query: { status: 'idle' | 'loading' | 'complete'; done: number; total: number; message: string }
  monitor: { enabled: boolean; lastFile: string | null; message: string; error: string | null }
  health: ApiHealth
  apiConfiguration: { filePath: string | null; applicationIdManaged: boolean; applicationIdSource: 'environment' | 'file' | null }
  activities: Activity[]; shipVersion: string; dataLocation: string
}
export interface FilePayload { name: string; base64: string }
export interface QueryOptions { force?: boolean; failedOnly?: boolean }
export interface WatchInput { region: Region; accountId: string; name: string; status: WatchStatus | null; note?: string }
export interface RadarBridge {
  getUpdates(): Promise<UpdateState>
  checkUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  installUpdate(): Promise<UpdateState>
  openUpdateDownload(): Promise<void>
  onUpdatesChanged(callback: (state: UpdateState) => void): () => void
  getState(): Promise<AppState>
  importArena(file: FilePayload): Promise<AppState>
  openFile(): Promise<AppState | null>
  loadDemo(): Promise<AppState>
  loadBattle(id: string): Promise<AppState>
  query(options?: QueryOptions): Promise<AppState>
  cancelQuery(): Promise<AppState>
  checkApiHealth(): Promise<AppState>
  saveSettings(settings: Settings): Promise<AppState>
  setWatch(input: WatchInput): Promise<AppState>
  chooseGamePath(): Promise<string | null>
  discoverGameClients(): Promise<GameClientDiscovery>
  inspectGameClient(path: string): Promise<GameClientInspection>
  copyText(text: string): Promise<void>
  openProfile(player: { accountId: string; region: Region; name: string }): Promise<void>
  windowControl(action: 'minimize' | 'maximize' | 'close'): void
  onStateChanged(callback: (state: AppState) => void): () => void
  desktop: boolean
}

export const REGION_LABELS: Record<Region, string> = { ASIA: '亚服', NA: '美服', EU: '欧服', RU: '俄服', CN: '国服' }
export const SHIP_LABELS: Record<ShipType, string> = { AirCarrier: '航空母舰', Battleship: '战列舰', Cruiser: '巡洋舰', Destroyer: '驱逐舰', Submarine: '潜艇', Unknown: '未知舰船' }
export const MODE_LABELS: Record<string, string> = { pvp: '随机战', RandomBattle: '随机战', cooperative: '联合作战', CooperativeBattle: '联合作战', brawl: '激斗', BrawlBattle: '激斗', ranked: '排位战', clan: '军团战', pve: '联合作战' }
