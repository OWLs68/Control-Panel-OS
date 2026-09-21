/**
 * The live adapter — a composite.
 *
 * Memory comes from GBrain through the Roma gateway; the other five reads
 * stay on the demo fixtures, each still marked «демо» on screen, because
 * nothing real feeds them yet. A missing key in the snapshot means exactly
 * that: not live, so not shown as live.
 *
 * What the phone keeps: the last normalised snapshot only — MemoryFact[],
 * fetchedAt and the source label — under one key, replaced on every success,
 * removed when the source goes back to demo. Never a raw GBrain response,
 * never a page, never a token.
 *
 * When the Mac is asleep the last snapshot stays on screen, marked stale with
 * the reason; the adapter never falls back to the demo facts on its own.
 */
import { emitDataChanged } from '../core/events.js'
import { GatewayError, type GatewayErrorKind, type LiveSnapshot } from '../hermes/contract.js'
import { fetchSnapshot, parseSnapshot } from '../hermes/gateway.js'
import { mockAdapter, type DataAdapter } from './adapters.js'
import type { MemoryFact, Sourced } from './types.js'

const CACHE_KEY = 'roma_live_snapshot'
const NO_DATA_SOURCE = 'gateway: даних ще немає'

export interface LiveStatus {
  /** When the facts on screen were fetched; null when there are none. */
  fetchedAt: number | null
  /** True when the last refresh failed and what is shown is the previous snapshot. */
  stale: boolean
  reason: GatewayErrorKind | null
  /** When the last refresh was attempted, successful or not. */
  lastAttemptAt: number
}

let snapshot: LiveSnapshot | null = readCache()
let lastError: GatewayErrorKind | null = null
let lastAttemptAt = 0
let inFlight: Promise<void> | null = null

export const liveAdapter: DataAdapter = {
  origin: 'live',
  label: 'GBrain через gateway',
  memory: (): Sourced<MemoryFact[]> => snapshot
    ? { value: snapshot.memory, origin: 'live', source: snapshot.source, fetchedAt: snapshot.fetchedAt }
    : { value: [], origin: 'live', source: NO_DATA_SOURCE, fetchedAt: 0 },
  agents: () => mockAdapter.agents(),
  projects: () => mockAdapter.projects(),
  blockers: (projectId) => mockAdapter.blockers(projectId),
  events: (limit) => mockAdapter.events(limit),
  attention: () => mockAdapter.attention(),
}

export function liveStatus(): LiveStatus {
  return { fetchedAt: snapshot?.fetchedAt ?? null, stale: lastError !== null, reason: lastError, lastAttemptAt }
}

/** One refresh at a time; a second call while one runs joins it. */
export function refreshLive(gatewayUrl: string): Promise<void> {
  if (inFlight) return inFlight
  lastAttemptAt = Date.now()
  inFlight = (async () => {
    try {
      const next = await fetchSnapshot(gatewayUrl)
      snapshot = next
      lastError = null
      writeCache(next)
    } catch (err) {
      lastError = err instanceof GatewayError ? err.kind : 'unreachable'
    } finally {
      inFlight = null
      emitDataChanged({ store: 'memory', kind: 'replace' })
    }
  })()
  return inFlight
}

/** Live is selected but there is no address to call. */
export function markNotConfigured(): void {
  lastError = 'not-configured'
  emitDataChanged({ store: 'memory', kind: 'replace' })
}

/** Back to demo: nothing live stays on the phone. */
export function clearLiveCache(): void {
  snapshot = null
  lastError = null
  try { localStorage.removeItem(CACHE_KEY) } catch { /* private mode */ }
}

function readCache(): LiveSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? parseSnapshot(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeCache(next: LiveSnapshot): void {
  const slim: LiveSnapshot = { memory: next.memory, fetchedAt: next.fetchedAt, source: next.source }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(slim)) } catch { /* quota or private mode: live still works for this visit */ }
}
