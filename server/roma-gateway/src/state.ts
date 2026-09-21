/**
 * The snapshot the phone reads.
 *
 * Only what is really live goes in. In this slice that is memory; agents,
 * projects, blockers, events and attention are deliberately ABSENT — not
 * empty arrays — so the app keeps showing them from its demo fixtures, marked
 * as such. A short cache absorbs a burst of taps without a burst of GBrain calls.
 */
import type { MemoryFact } from '../../../src/data/types.ts'

export interface FactsReader {
  /** Newest first, active facts only. */
  recentFacts(limit: number): Promise<unknown>
}

export interface Snapshot {
  memory: MemoryFact[]
  fetchedAt: number
  source: string
  /** Rows GBrain returned that did not carry the fields we need. */
  dropped: number
}

export const SNAPSHOT_SOURCE = 'gbrain:recall'
const CACHE_MS = 10_000

export function createStateBuilder(
  reader: FactsReader,
  mapFacts: (rows: unknown) => { facts: MemoryFact[]; dropped: number },
  limit: number,
  now: () => number = Date.now,
) {
  let cached: Snapshot | null = null

  return async function buildState(): Promise<Snapshot> {
    if (cached && now() - cached.fetchedAt < CACHE_MS) return cached
    const rows = await reader.recentFacts(limit)
    const { facts, dropped } = mapFacts(rows)
    cached = { memory: facts, fetchedAt: now(), source: SNAPSHOT_SOURCE, dropped }
    return cached
  }
}
