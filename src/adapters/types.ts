/**
 * Adapter interfaces — the only contract the UI is allowed to know about.
 *
 * Screens never talk to GBrain, Hermes, GitHub or Drive directly. They talk to
 * these interfaces. Today every implementation is a mock; swapping in a real
 * one (through the future thin gateway) must not require touching any screen.
 *
 * Every method returns `Sourced<T>` so the UI can always label origin
 * (mock vs live) and source of truth without the screen knowing the backend.
 */
import type {
  ActivityEvent,
  ActivityFilter,
  AgentStatus,
  BackupStatus,
  ConnectionStatus,
  MemoryItem,
  MemoryVerb,
  ProjectDetail,
  ProjectSummary,
  Sourced,
  SystemHealth,
} from '@/domain/types'

export interface SystemAdapter {
  /** Rollup for the dashboard: health signals, warnings, waiting-for-Roman. */
  getSystemHealth(): Promise<Sourced<SystemHealth>>
}

export interface ProjectsAdapter {
  listProjects(): Promise<Sourced<ProjectSummary[]>>
  /** Resolves to null when no project with that id is registered. */
  getProject(id: string): Promise<Sourced<ProjectDetail | null>>
}

export interface GBrainAdapter {
  /** Which of the seven memory verbs this implementation actually supports. */
  supportedVerbs(): MemoryVerb[]
  /** `recall` — free-text semantic search over stored memory. */
  search(query: string): Promise<Sourced<MemoryItem[]>>
  /** Most recently written or updated memory, newest first. */
  recent(limit?: number): Promise<Sourced<MemoryItem[]>>
}

export interface AgentsAdapter {
  listAgents(): Promise<Sourced<AgentStatus[]>>
}

export interface ActivityAdapter {
  listEvents(filter?: ActivityFilter): Promise<Sourced<ActivityEvent[]>>
}

export interface ConnectionsAdapter {
  listConnections(): Promise<Sourced<ConnectionStatus[]>>
}

export interface BackupAdapter {
  getBackupStatus(): Promise<Sourced<BackupStatus>>
}

/** The full set of adapters the app runs against. */
export interface AdapterRegistry {
  system: SystemAdapter
  projects: ProjectsAdapter
  gbrain: GBrainAdapter
  agents: AgentsAdapter
  activity: ActivityAdapter
  connections: ConnectionsAdapter
  backup: BackupAdapter
}
