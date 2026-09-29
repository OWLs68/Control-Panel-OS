/**
 * The snapshot the phone reads.
 *
 * Only what is really live goes in: memory from GBrain, the newest events when
 * the Event Center is switched on (ROMA_EVENTS_TOKEN_FILE), and the agents —
 * the registry read against those events and Hermes' answer (agents.ts).
 * Projects, blockers and attention are deliberately ABSENT — not empty arrays —
 * so the app keeps showing them from its demo fixtures, marked as such. The
 * same holds for events while the Event Center is off.
 *
 * A short cache absorbs a burst of taps without a burst of GBrain calls. The
 * events are read on every call, outside that cache: they are a local file,
 * and a new one should not wait for GBrain's cache to expire.
 */
import type { Agent, MemoryFact, SystemEvent } from '../../../src/data/types.ts'
import { deriveAgents, eventsForSnapshot, type AgentDef } from './agents.ts'

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
  /** The registry, read against the events and Hermes' answer. Absent when the gateway has no registry. */
  agents?: Agent[]
}

/** Who exists, and how to tell whether Crow's Hermes answers (null — nothing to ask: Crow is «немає даних»). */
export interface AgentsSource {
  registry: readonly AgentDef[]
  hermesAlive: (() => Promise<boolean>) | null
}

export const SNAPSHOT_SOURCE = 'gbrain:recall'
const CACHE_MS = 10_000

export function createStateBuilder(
  reader: FactsReader,
  mapFacts: (rows: unknown) => { facts: MemoryFact[]; dropped: number },
  limit: number,
  now: () => number = Date.now,
  /** `all`: how many events the agents are read from — the whole store, not the snapshot's newest. */
  events: { reader: EventsReader; limit: number; all?: number } | null = null,
  agents: AgentsSource | null = null,
) {
  let cached: Snapshot | null = null

  return async function buildState(): Promise<Snapshot> {
    if (!cached || now() - cached.fetchedAt >= CACHE_MS) {
      const rows = await reader.recentFacts(limit)
      const { facts, dropped } = mapFacts(rows)
      cached = { memory: facts, fetchedAt: now(), source: SNAPSHOT_SOURCE, dropped }
    }
    if (!events && !agents) return cached
    const all = events ? await events.reader.list(Math.max(events.limit, events.all ?? events.limit)) : []
    const snapshot: Snapshot = { ...cached }
    if (events) snapshot.events = agents ? eventsForSnapshot(all, agents.registry, events.limit) : all.slice(0, events.limit)
    if (agents) {
      const alive = agents.hermesAlive ? await agents.hermesAlive() : null
      snapshot.agents = deriveAgents(agents.registry, all, alive, now())
    }
    return snapshot
  }
}
