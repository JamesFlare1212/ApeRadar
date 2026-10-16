export const UPDATE_RELEASES_URL = 'https://github.com/JamesFlare1212/ApeRadar/releases/latest'

export interface UpdateState {
  mode: 'installed' | 'portable' | 'disabled'
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'
  currentVersion: string
  availableVersion: string | null
  downloadPercent: number | null
  checkedAt: number | null
  error: string | null
  errorContext: 'check' | 'download' | 'install' | null
  disabledReason: string | null
  notAppliedVersion: string | null
}

export function initialUpdateState(currentVersion: string, mode: UpdateState['mode'] = 'disabled', disabledReason: string | null = null): UpdateState {
  return {
    mode,
    status: mode === 'disabled' ? 'disabled' : 'idle',
    currentVersion,
    availableVersion: null,
    downloadPercent: null,
    checkedAt: null,
    error: null,
    errorContext: null,
    disabledReason,
    notAppliedVersion: null,
  }
}
