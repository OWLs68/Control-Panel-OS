/**
 * The live adapter — a composite.
 *
 * Memory comes from GBrain through the Roma gateway, and events from its Event
 * Center when that is switched on; agents, projects, blockers and attention
 * stay on the demo fixtures, each still marked «демо» on screen, because
 * nothing real feeds them yet. A missing key in the snapshot means exactly
 * that: not live, so not shown as live — a gateway without the Event Center
 * leaves the events on the demo feed. Tasks are neither: Roman's own, kept on
 * this device and marked «локально» in both modes.
 *
 * What the phone keeps: the last normalised snapshot only — MemoryFact[], the
 * events when there are any, fetchedAt and the source label — under one key,
 * replaced on every success, removed when the source goes back to demo. Never
 * a raw GBrain response, never a page, never a token.
 *
 * When the Mac is asleep the last snapshot stays on screen, marked stale with
 * the reason; the adapter never falls back to the demo facts on its own.
 */
import { emitDataChanged } from '../core/events.js'
import { GatewayError, type GatewayErrorKind, type LiveSnapshot } from '../hermes/contract.js'
import { fetchSnapshot, parseSnapshot } from '../hermes/gateway.js'
import { mockAdapter, readLocalTasks, type DataAdapter } from './adapters.js'
import type { MemoryFact, Sourced, SystemEvent } from './types.js'

const CACHE_KEY = 'roma_live_snapshot'
const NO_DATA_SOURCE = 'gateway: даних ще немає'
/** Where live events come from, as the screens name it. */
export const EVENTS_SOURCE = 'gateway:events'

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
  events: (limit = 50): Sourced<SystemEvent[]> => snapshot?.events
    ? { value: [...snapshot.events].sort((a, b) => b.ts - a.ts).slice(0, limit), origin: 'live', source: EVENTS_SOURCE, fetchedAt: snapshot.fetchedAt }
    : mockAdapter.events(limit),
  attention: () => mockAdapter.attention(),
  tasks: readLocalTasks,
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
  if (next.events) slim.events = next.events
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(slim)) } catch { /* quota or private mode: live still works for this visit */ }
}
