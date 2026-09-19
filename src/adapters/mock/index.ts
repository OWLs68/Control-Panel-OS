/**
 * Mock adapter implementations.
 *
 * Each one stamps `origin: 'mock'` and the real `sourceOfTruth` so the UI can
 * label both without knowing which backend it is talking to. A small artificial
 * latency keeps the loading states honest during development — real adapters
 * will be async too, and screens must not assume instant data.
 */
import type {
  ActivityAdapter,
  AgentsAdapter,
  AdapterRegistry,
  BackupAdapter,
  ConnectionsAdapter,
  GBrainAdapter,
  ProjectsAdapter,
  SystemAdapter,
} from '@/adapters/types'
import type {
  ActivityFilter,
  MemoryItem,
  MemoryVerb,
  SourceOfTruth,
  Sourced,
} from '@/domain/types'
import {
  SNAPSHOT_AT,
  mockActivity,
  mockAgents,
  mockBackup,
  mockConnections,
  mockMemory,
  mockProjects,
  mockSystemHealth,
} from './fixtures'

/** Artificial latency, in ms. Zero under test so specs stay fast. */
const LATENCY = import.meta.env?.MODE === 'test' ? 0 : 140

function delay(ms = LATENCY): Promise<void> {
  return ms === 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))
}

async function sourced<T>(data: T, sourceOfTruth: SourceOfTruth): Promise<Sourced<T>> {
  await delay()
  return {
    data,
    origin: 'mock',
    sourceOfTruth,
    retrievedAt: SNAPSHOT_AT,
  }
}

export const mockSystemAdapter: SystemAdapter = {
  getSystemHealth: () => sourced(mockSystemHealth, 'local-runtime'),
}

export const mockProjectsAdapter: ProjectsAdapter = {
  listProjects: () =>
    sourced(
      // Strip the detail-only fields so list screens cannot accidentally depend
      // on data a real list endpoint would not return.
      mockProjects.map(({ currentState: _s, blockers: _b, links: _l, ...summary }) => summary),
      'project-state',
    ),
  getProject: (id: string) =>
    sourced(mockProjects.find((p) => p.id === id) ?? null, 'project-state'),
}

export const mockGBrainAdapter: GBrainAdapter = {
  supportedVerbs: (): MemoryVerb[] => ['recall', 'entity', 'delta'],
  search: (query: string) => {
    const q = query.trim().toLowerCase()
    const hits: MemoryItem[] = q
      ? mockMemory.filter((m) =>
          [m.content, m.entity, m.topic, m.provenance]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(q)),
        )
      : mockMemory
    return sourced(hits, 'gbrain')
  },
  recent: (limit = 10) =>
    sourced(
      [...mockMemory]
        .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
        .slice(0, limit),
      'gbrain',
    ),
}

export const mockAgentsAdapter: AgentsAdapter = {
  listAgents: () => sourced(mockAgents, 'local-runtime'),
}

export const mockActivityAdapter: ActivityAdapter = {
  listEvents: (filter?: ActivityFilter) => {
    let events = [...mockActivity].sort((a, b) => b.at.localeCompare(a.at))
    if (filter?.kinds?.length) {
      events = events.filter((e) => filter.kinds!.includes(e.kind))
    }
    if (filter?.projectId) {
      events = events.filter((e) => e.projectId === filter.projectId)
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase()
      events = events.filter((e) =>
        `${e.title} ${e.detail ?? ''} ${e.actor}`.toLowerCase().includes(q),
      )
    }
    return sourced(events, 'control-panel')
  },
}

export const mockConnectionsAdapter: ConnectionsAdapter = {
  listConnections: () => sourced(mockConnections, 'local-runtime'),
}

export const mockBackupAdapter: BackupAdapter = {
  getBackupStatus: () => sourced(mockBackup, 'local-runtime'),
}

export const mockAdapters: AdapterRegistry = {
  system: mockSystemAdapter,
  projects: mockProjectsAdapter,
  gbrain: mockGBrainAdapter,
  agents: mockAgentsAdapter,
  activity: mockActivityAdapter,
  connections: mockConnectionsAdapter,
  backup: mockBackupAdapter,
}
