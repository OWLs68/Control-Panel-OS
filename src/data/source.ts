/**
 * Which adapter the screens read: the demo fixtures or GBrain through the
 * gateway. Two plain settings on the phone — the choice and the gateway's
 * address, which is a hostname, not a secret — and nothing else.
 *
 * Refreshes are deliberate, not eager: at boot, when the page is shown again,
 * when the app comes back into view, and every 90 seconds while it is in
 * view. Nothing polls in the background.
 */
import { emitDataChanged } from '../core/events.js'
import { normalizeGatewayUrl } from '../hermes/gateway.js'
import { mockAdapter, setAdapter } from './adapters.js'
import { clearLiveCache, liveAdapter, liveStatus, markNotConfigured, refreshLive } from './live-adapter.js'

export type DataSource = 'demo' | 'live'

const SOURCE_KEY = 'roma_data_source'
const URL_KEY = 'roma_gateway_url'
const REFRESH_EVERY_MS = 90_000
/** pageshow fires on the first load too, right after boot's own refresh. */
const PAGESHOW_MIN_GAP_MS = 5_000

export function getDataSource(): DataSource {
  try { return localStorage.getItem(SOURCE_KEY) === 'live' ? 'live' : 'demo' } catch { return 'demo' }
}

export function setDataSource(next: DataSource): void {
  try { localStorage.setItem(SOURCE_KEY, next) } catch { /* private mode */ }
  applyDataSource()
}

export function getGatewayUrl(): string {
  try { return localStorage.getItem(URL_KEY) ?? '' } catch { return '' }
}

/** Stores the cleaned address; an empty string clears it. Returns false when it is not an address we would call. */
export function setGatewayUrl(raw: string): boolean {
  const cleaned = raw.trim() ? normalizeGatewayUrl(raw) : ''
  if (cleaned === null) return false
  try {
    if (cleaned) localStorage.setItem(URL_KEY, cleaned)
    else localStorage.removeItem(URL_KEY)
  } catch { /* private mode */ }
  if (getDataSource() === 'live') applyDataSource()
  return true
}

/** Picks the adapter for the stored choice and kicks off a refresh when live. */
export function applyDataSource(): void {
  if (getDataSource() === 'live') {
    setAdapter(liveAdapter)
    const url = getGatewayUrl()
    if (url) void refreshLive(url)
    else markNotConfigured()
  } else {
    setAdapter(mockAdapter)
    clearLiveCache()
  }
  emitDataChanged({ store: 'source', kind: 'replace' })
}

export function setupDataSourceRefresh(): void {
  const refresh = () => {
    if (getDataSource() !== 'live' || document.visibilityState !== 'visible') return
    const url = getGatewayUrl()
    if (url) void refreshLive(url)
  }
  window.addEventListener('pageshow', () => {
    if (Date.now() - liveStatus().lastAttemptAt < PAGESHOW_MIN_GAP_MS) return
    refresh()
  })
  document.addEventListener('visibilitychange', refresh)
  setInterval(refresh, REFRESH_EVERY_MS)
}
