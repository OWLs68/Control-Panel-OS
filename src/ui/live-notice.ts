/**
 * The line under a live read: where it came from and how fresh it is, or —
 * when the last refresh failed — how old it is and why. One wording for every
 * screen that shows the gateway's snapshot (Памʼять, Події), so a sleeping Mac
 * reads the same everywhere.
 */
import { relativeTime } from '../core/dom.js'
import { liveStatus } from '../data/live-adapter.js'
import type { Sourced } from '../data/types.js'
import type { GatewayErrorKind } from '../hermes/contract.js'

export function liveNoticeText(src: Sourced<unknown>): string {
  const status = liveStatus()
  const age = src.fetchedAt ? ageLabel(src.fetchedAt) : ''
  if (!status.stale) return `Джерело: ${src.source} · оновлено ${age}`
  if (src.fetchedAt) return `Оновлено ${age} · ${staleReason(status.reason)}`
  return `Немає даних · ${staleReason(status.reason)}`
}

export function ageLabel(ts: number): string {
  return Date.now() - ts < 60_000 ? 'щойно' : relativeTime(ts, 0)
}

export function staleReason(kind: GatewayErrorKind | null): string {
  switch (kind) {
    case 'offline': return 'немає мережі'
    case 'unauthorized': return 'немає доступу'
    case 'rate-limited': return 'забагато запитів'
    case 'bad-response': return 'відповідь gateway не розпізнана'
    case 'not-configured': return 'адресу gateway не задано'
    case 'unreachable':
    default: return 'Mac недоступний'
  }
}
