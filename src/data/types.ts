/** Domain shapes for the OS core. Personal modules come later, as modules. */
import type { Entity } from '../core/entity.js'

export type Risk = 'L0' | 'L1' | 'L2' | 'L3'
export type AgentStatus = 'online' | 'idle' | 'offline'
export type Severity = 'info' | 'warning' | 'critical'

export interface Agent extends Entity {
  name: string
  role: string
  model: string
  status: AgentStatus
  risk: Risk
  /** What it is doing right now, in one line. */
  task: string | null
}

export interface Blocker extends Entity {
  projectId: string
  title: string
  detail: string
  severity: Severity
  /** Who or what has to move for this to clear. */
  waitingOn: string
}

export interface Project extends Entity {
  name: string
  summary: string
  status: 'active' | 'paused' | 'done'
  /** 0–100. */
  progress: number
  ownerAgentId: string | null
}

/**
 * What a producer — Crow/Hermes, an agent, a script on the Mac — may report to
 * the Event Center (the Roma gateway, `POST /api/v1/events`).
 */
export type AgentEventKind = 'agent_started' | 'agent_result' | 'agent_finished' | 'agent_blocked' | 'alert'

/**
 * One thing that happened. The same contract for the demo feed and the live
 * one: the demo fixtures use the first five kinds and leave the agent fields
 * out; live events come from the Event Center with every field set.
 */
export interface SystemEvent extends Entity {
  /** When it happened (ms). `created_at` is when the Event Center received it. */
  ts: number
  kind: 'deploy' | 'index' | 'backup' | 'agent' | 'note' | AgentEventKind
  title: string
  detail: string
  /** Who reported it, e.g. 'shopping-scout' or 'curl'. */
  source: string
  agentId?: string | null
  taskId?: string | null
  projectId?: string | null
  severity?: Severity
  /** Roman has to act. A flag across kinds, like a task's — not a kind of its own. */
  needsRoman?: boolean
}

export type TaskStatus = 'backlog' | 'planned' | 'in_progress' | 'blocked' | 'done'

/**
 * A unit of work — Roman's own or an agent's. Real from the first one: kept on
 * this device (origin 'local'), never seeded, never touched by the demo reset.
 * Rules and views live in tasks.ts.
 */
export interface Task extends Entity {
  title: string
  status: TaskStatus
  /** Roman has to act before it can move. A flag across statuses, not a status. */
  needsRoman: boolean
  /** A task may live outside any project. */
  projectId: string | null
  /** The agent doing it; null — no agent (Roman's own, or not assigned yet). */
  agentId: string | null
  /** The one active blocker (v1). Shown only while the status is 'blocked'. */
  blockerId: string | null
}

export interface MemoryFact extends Entity {
  text: string
  category: 'system' | 'project' | 'person' | 'preference'
  ts: number
}

/** A thing that cannot move without Roman. The point of the Control screen. */
export interface Attention extends Entity {
  title: string
  detail: string
  risk: Risk
  severity: Severity
  /** Where tapping it should take you. */
  moduleId: string
  entityId: string | null
}

/**
 * Where a read came from: 'mock' — demo fixtures; 'live' — the system through
 * the gateway; 'local' — real data that lives only on this device (tasks).
 */
export type Origin = 'mock' | 'live' | 'local'

/**
 * Provenance envelope, carried over from the previous Control Panel.
 *
 * Every read says where it came from, and the interface has to admit it on
 * screen rather than let a demo number be mistaken for the real state of the
 * system — or a phone-local list for the system's own.
 */
export interface Sourced<T> {
  value: T
  origin: Origin
  /** Human-readable source of truth, e.g. 'fixtures' or 'hermes:/agents'. */
  source: string
  fetchedAt: number
}

export function sourced<T>(value: T, origin: Origin, source: string): Sourced<T> {
  return { value, origin, source, fetchedAt: Date.now() }
}
