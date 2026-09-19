/**
 * Minimal frontend domain types for the Control Panel.
 *
 * These are a *projection* of Roman AI OS concepts for display purposes only.
 * They are deliberately small: new types get added when a screen actually needs
 * them, not in anticipation. The Control Panel is never a source of truth — see
 * `SourceOfTruth` below, which every surfaced record carries so the UI can show
 * where the real answer lives.
 */

/** Where the actual truth for a piece of data lives (canonical source matrix). */
export type SourceOfTruth =
  | 'gbrain' // durable long-term semantic memory
  | 'project-state' // STATE.md — the project's current savegame
  | 'project-doc' // PROJECT.md / LESSONS.md — stable project context
  | 'github' // code, branches, commits
  | 'google-drive' // documents
  | 'gmail'
  | 'calendar'
  | 'hermes' // agent runtime
  | 'local-runtime' // the machine the OS runs on (Docker, Ollama, PGLite files)
  | 'control-panel' // derived by this UI only; never canonical

/** Whether a value came from a real integration or from bundled demo fixtures. */
export type DataOrigin = 'mock' | 'live'

/** Health rollup used across the whole panel. */
export type HealthLevel = 'ok' | 'warn' | 'error' | 'unknown' | 'off'

/** Envelope every adapter returns, so the UI can always label provenance. */
export interface Sourced<T> {
  data: T
  origin: DataOrigin
  /** Where the real answer lives; the panel only mirrors it. */
  sourceOfTruth: SourceOfTruth
  /** When this snapshot was taken (ISO 8601). */
  retrievedAt: string
  /** Set when the underlying source could not be reached. */
  staleReason?: string
}

/* ------------------------------------------------------------------ system */

/** One observable health signal (canonical architecture §12.1 observability). */
export interface HealthSignal {
  id: string
  label: string
  level: HealthLevel
  /** Short human-readable value, e.g. "0.51.0.0" or "3 days ago". */
  value: string
  detail?: string
  sourceOfTruth: SourceOfTruth
}

export interface SystemHealth {
  level: HealthLevel
  headline: string
  signals: HealthSignal[]
  /** Things that need Roman personally — the panel's highest-priority concept. */
  waitingForRoman: WaitingItem[]
  warnings: SystemWarning[]
}

export interface SystemWarning {
  id: string
  level: Exclude<HealthLevel, 'ok' | 'unknown'>
  title: string
  detail: string
  /** Project this warning belongs to, when it is project-scoped. */
  projectId?: string
}

/** An item blocked on a human decision. Canonical rule: never hide these. */
export interface WaitingItem {
  id: string
  title: string
  /** Why Roman specifically is needed (e.g. irreversible action, L3 risk). */
  reason: string
  projectId?: string
  since: string
  /** Risk level of the action being gated (canonical architecture §10.5). */
  riskLevel?: RiskLevel
}

/** Action risk levels L0–L3 from the canonical architecture. */
export type RiskLevel = 'L0' | 'L1' | 'L2' | 'L3'

/* ---------------------------------------------------------------- projects */

export type ProjectStatus = 'active' | 'paused' | 'watch-only' | 'closed'

export interface CanonicalLink {
  label: string
  url: string
  kind: SourceOfTruth
}

export interface ProjectSummary {
  id: string
  name: string
  status: ProjectStatus
  /** One line: what this project is for right now. */
  currentGoal: string
  shortDescription: string
  /** The single exact next step, taken from STATE.md. */
  nextStep: string
  blockerCount: number
  lastUpdate: string
}

export interface ProjectDetail extends ProjectSummary {
  /** Current STATE.md checkpoint, rendered as plain paragraphs. */
  currentState: string[]
  blockers: Blocker[]
  links: CanonicalLink[]
  /** Set when the project has a registered repo / Drive folder. */
  repoUrl?: string
  driveFolderUrl?: string
}

export interface Blocker {
  id: string
  title: string
  detail: string
  /** Who or what the work is waiting on. */
  waitingOn: string
  since: string
}

/* ------------------------------------------------------------------ agents */

export type AgentState = 'online' | 'idle' | 'offline' | 'error' | 'planned'

export interface AgentStatus {
  id: string
  name: string
  role: string
  state: AgentState
  /** Provider/model where that concept applies (Hermes, Claude, GPT). */
  provider?: string
  model?: string
  /** Highest risk level this agent may act at without asking Roman. */
  maxAutonomousRisk: RiskLevel
  permissions: string[]
  connectedTools: string[]
  /** How this agent reaches shared memory, or why it cannot. */
  memoryAccess: string
  lastActivity?: string
  issues: string[]
}

/* ------------------------------------------------------------------ memory */

/** Memory layer, per canonical architecture §5.1 / §11.1. */
export type MemoryLayer = 'semantic' | 'episodic' | 'task-state'

/** Lifecycle of a stored fact, including temporal truth. */
export type MemoryState = 'active' | 'obsolete' | 'forgotten' | 'superseded'

export interface MemoryItem {
  id: string
  /** The fact itself, as stored. */
  content: string
  layer: MemoryLayer
  state: MemoryState
  /** Entity the fact hangs off, e.g. "people/me". */
  entity?: string
  topic?: string
  /** Where the fact came from, e.g. "review:old-brain+user-validated-2026-09-16". */
  provenance: string
  createdAt: string
  updatedAt?: string
  relatedProjectId?: string
}

/** The seven GBrain memory verbs the adapter exposes. */
export type MemoryVerb =
  | 'recall'
  | 'remember'
  | 'entity'
  | 'synthesize'
  | 'forget'
  | 'context_pack'
  | 'delta'

/* ---------------------------------------------------------------- activity */

export type ActivityKind =
  | 'project-checkpoint'
  | 'memory-write'
  | 'memory-correction'
  | 'agent-action'
  | 'integration-change'
  | 'backup'
  | 'error'
  | 'decision'
  | 'task-completed'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  title: string
  detail?: string
  /** Who did it: an agent id, "roman", or a system component. */
  actor: string
  at: string
  projectId?: string
  sourceOfTruth: SourceOfTruth
}

export interface ActivityFilter {
  kinds?: ActivityKind[]
  projectId?: string
  search?: string
}

/* ------------------------------------------------------- connections/backup */

export type ConnectionState = 'connected' | 'degraded' | 'disconnected' | 'not-configured'

export interface ConnectionStatus {
  id: string
  name: string
  /** What this connection is canonical for. */
  role: string
  state: ConnectionState
  detail: string
  lastChecked: string
  /** True when credentials are shared with another client instead of scoped. */
  sharedCredentialWarning?: string
}

export interface BackupStatus {
  level: HealthLevel
  lastBackupAt?: string
  location?: string
  /** Whether a restore has actually been proven, not just assumed. */
  restoreVerified: boolean
  offDeviceCopy: boolean
  detail: string
}
