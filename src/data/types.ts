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

export interface SystemEvent extends Entity {
  ts: number
  kind: 'deploy' | 'index' | 'backup' | 'agent' | 'note'
  title: string
  detail: string
  source: string
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
 * Provenance envelope, carried over from the previous Control Panel.
 *
 * Every read says where it came from. Stage 1 is entirely fixtures, and the
 * interface has to admit that on screen rather than let a demo number be
 * mistaken for the real state of the system.
 */
export interface Sourced<T> {
  value: T
  origin: 'mock' | 'live'
  /** Human-readable source of truth, e.g. 'fixtures' or 'hermes:/agents'. */
  source: string
  fetchedAt: number
}

export function sourced<T>(value: T, origin: 'mock' | 'live', source: string): Sourced<T> {
  return { value, origin, source, fetchedAt: Date.now() }
}
