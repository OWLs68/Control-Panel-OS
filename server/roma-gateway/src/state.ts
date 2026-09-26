/**
 * The snapshot the phone reads.
 *
 * Only what is really live goes in: memory from GBrain, and — when the Event
 * Center is switched on (ROMA_EVENTS_TOKEN_FILE) — the newest events. Agents,
 * projects, blockers and attention are deliberately ABSENT — not empty arrays —
 * so the app keeps showing them from its demo fixtures, marked as such. The
 * same holds for events while the Event Center is off.
 *
 * A short cache absorbs a burst of taps without a burst of GBrain calls. The
 * events are read on every call, outside that cache: they are a local file,
 * and a new one should not wait for GBrain's cache to expire.
 */
import type { MemoryFact, SystemEvent } from '../../../src/data/types.ts'

export interface FactsReader {
  /** Newest first, active facts only. */
  recentFacts(limit: number): Promise<unknown>
}

/** The Event Center as the snapshot sees it: a newest-first list that never throws. */
export interface EventsReader {
  list(limit: number): Promise<SystemEvent[]>
}

export interface Snapshot {
  memory: MemoryFact[]
  fetchedAt: number
  source: string
  /** Rows GBrain returned that did not carry the fields we need. */
  dropped: number
  /** Present only while the Event Center is on. Newest first. */
  events?: SystemEvent[]
}

export const SNAPSHOT_SOURCE = 'gbrain:recall'
const CACHE_MS = 10_000

export function createStateBuilder(
  reader: FactsReader,
  mapFacts: (rows: unknown) => { facts: MemoryFact[]; dropped: number },
  limit: number,
  now: () => number = Date.now,
  events: { reader: EventsReader; limit: number } | null = null,
) {
  let cached: Snapshot | null = null

  return async function buildState(): Promise<Snapshot> {
    if (!cached || now() - cached.fetchedAt >= CACHE_MS) {
      const rows = await reader.recentFacts(limit)
      const { facts, dropped } = mapFacts(rows)
      cached = { memory: facts, fetchedAt: now(), source: SNAPSHOT_SOURCE, dropped }
    }
    if (!events) return cached
    return { ...cached, events: await events.reader.list(events.limit) }
  }
}
