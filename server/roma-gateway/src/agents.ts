/**
 * The agents the phone shows — who exists, and what is known about each.
 *
 * Two sources, on purpose:
 *   - the REGISTRY says who exists (name, role, model, risk). It is a list in
 *     this file, without a secret in it: an agent is added here by decision,
 *     not by the first event that names it;
 *   - what is KNOWN about each comes from what the gateway actually sees:
 *     the Event Center's events for `agentId`, and — for Crow — whether
 *     Hermes answers.
 *
 * Status is never invented:
 *   - Crow (Hermes): Hermes answers → online, it does not → offline. Crow works
 *     in the chat every day; a silent event feed says nothing about him. No
 *     probe configured (no HERMES_TOKEN_FILE) → unknown.
 *   - anyone else: no event ever → unknown («немає даних»), not offline.
 *     Offline is only for an agent the data says stopped: its newest event is
 *     older than it is expected to be quiet.
 *       online   the newest event is `agent_started`, under 15 minutes old
 *       idle     the newest event is younger than the agent's quiet window
 *       offline  older than that
 */
import type { Agent, AgentStatus, Risk, SystemEvent } from '../../../src/data/types.ts'

export interface AgentDef {
  id: string
  name: string
  role: string
  model: string
  risk: Risk
  /** `hermes`: status is Hermes' own answer, not the event feed. */
  probe?: 'hermes'
  /** How long an agent may be quiet and still be «чекає». */
  quietAfterMs?: number
}

const HOUR = 3_600_000
export const WORKING_WINDOW_MS = 15 * 60_000

export const AGENT_REGISTRY: readonly AgentDef[] = [
  { id: 'crow', name: 'Crow', role: 'Оркестратор', model: 'Hermes', risk: 'L1', probe: 'hermes', quietAfterMs: 24 * HOUR },
  // A daily scan at 07:00: quiet for a day is normal, 26 h allows for a late run.
  { id: 'shopping-scout', name: 'Shopping Scout', role: 'Пошук знижок', model: 'сервіс на Mac', risk: 'L0', quietAfterMs: 26 * HOUR },
  { id: 'mac-worker', name: 'Mac Worker', role: 'Виконавець на Mac', model: 'сервіс на Mac', risk: 'L1', quietAfterMs: 24 * HOUR },
]

/** The newest event of one agent; `events` may come in any order. */
function newestOf(events: readonly SystemEvent[], id: string): SystemEvent | null {
  let best: SystemEvent | null = null
  for (const e of events) if (e.agentId === id && (!best || e.ts > best.ts)) best = e
  return best
}

export function statusOf(def: AgentDef, newest: SystemEvent | null, hermesAlive: boolean | null, now: number): AgentStatus {
  if (def.probe === 'hermes') {
    if (hermesAlive === null) return 'unknown'
    return hermesAlive ? 'online' : 'offline'
  }
  if (!newest) return 'unknown'
  const age = now - newest.ts
  if (newest.kind === 'agent_started' && age < WORKING_WINDOW_MS) return 'online'
  return age < (def.quietAfterMs ?? 24 * HOUR) ? 'idle' : 'offline'
}

/**
 * The registry, read against what the gateway knows right now. `events` is the
 * whole store (any order), not the snapshot's newest 50: a quiet agent's last
 * word must not fall out of view because a busy one talked more.
 */
export function deriveAgents(
  registry: readonly AgentDef[],
  events: readonly SystemEvent[],
  hermesAlive: boolean | null,
  now: number,
): Agent[] {
  const stamp = new Date(now).toISOString()
  return registry.map((def) => {
    const newest = newestOf(events, def.id)
    return {
      id: def.id, user_id: null, created_at: stamp, updated_at: stamp, deleted_at: null, hlc: null,
      name: def.name, role: def.role, model: def.model, risk: def.risk,
      status: statusOf(def, newest, hermesAlive, now),
      task: null,
      lastActivity: newest ? { ts: newest.ts, title: newest.title } : null,
    }
  })
}

/**
 * The events the snapshot carries: the newest `limit`, plus each agent's newest
 * event that has a typed payload — so a price card does not disappear from the
 * agent's screen the day other agents talk more than fifty times.
 */
export function eventsForSnapshot(all: readonly SystemEvent[], registry: readonly AgentDef[], limit: number): SystemEvent[] {
  const newest = [...all].sort((a, b) => b.ts - a.ts)
  const out = newest.slice(0, limit)
  const have = new Set(out.map((e) => e.id))
  for (const def of registry) {
    const withData = newest.find((e) => e.agentId === def.id && e.data)
    if (withData && !have.has(withData.id)) { out.push(withData); have.add(withData.id) }
  }
  return out
}
