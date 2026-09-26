/**
 * Adapter contracts.
 *
 * Screens talk to this interface and nothing else. Today it is served by
 * fixtures; when Hermes is real, a second implementation fills the same shape
 * and the screens do not change. That is the whole point of writing it down
 * before there is a backend to write against.
 */
import { type Agent, type Attention, type Blocker, type MemoryFact, type Project, type Sourced, type SystemEvent, type Task, sourced } from './types.js'
import { agentStore, attentionStore, blockerStore, eventStore, memoryStore, projectStore, taskStore } from './stores.js'
import { tasksFor, type TaskFilter } from './tasks.js'

export interface DataAdapter {
  readonly origin: 'mock' | 'live'
  readonly label: string
  agents(): Sourced<Agent[]>
  projects(): Sourced<Project[]>
  blockers(projectId?: string): Sourced<Blocker[]>
  events(limit?: number): Sourced<SystemEvent[]>
  memory(): Sourced<MemoryFact[]>
  attention(): Sourced<Attention[]>
  /** Roman's own tasks, optionally a view by project or agent — the same objects, never copies. */
  tasks(filter?: TaskFilter): Sourced<Task[]>
}

/**
 * Tasks are real from the first one and live on this device, whichever
 * adapter is active: not demo, not the system's (v1 has no write path to
 * Hermes or GBrain). Both adapters read them here.
 */
export function readLocalTasks(filter?: TaskFilter): Sourced<Task[]> {
  return sourced(tasksFor(taskStore.all(), filter), 'local', 'local:tasks')
}

/** Reads the seeded fixtures out of the local stores. */
export const mockAdapter: DataAdapter = {
  origin: 'mock',
  label: 'демо-дані',
  agents: () => sourced(agentStore.all(), 'mock', 'fixtures:agents'),
  projects: () => sourced(projectStore.all(), 'mock', 'fixtures:projects'),
  blockers: (projectId) =>
    sourced(
      blockerStore.all().filter((b) => !projectId || b.projectId === projectId),
      'mock',
      'fixtures:blockers',
    ),
  events: (limit = 50) =>
    sourced(
      [...eventStore.all()].sort((a, b) => b.ts - a.ts).slice(0, limit),
      'mock',
      'fixtures:events',
    ),
  memory: () => sourced(memoryStore.all(), 'mock', 'fixtures:memory'),
  attention: () => sourced(attentionStore.all(), 'mock', 'fixtures:attention'),
  tasks: readLocalTasks,
}

let active: DataAdapter = mockAdapter

export function getAdapter(): DataAdapter {
  return active
}

/**
 * «Потребує мене» in live mode has no live source yet: the attention list is
 * still the demo fixtures. Shown next to live data, those rows would read as
 * real things waiting on Roman — so in live mode Control, Crow's greeting and
 * the bell do not show them at all, and say so instead.
 */
export function attentionIsDemoInLive(adapter: DataAdapter = active): boolean {
  return adapter.origin === 'live' && adapter.attention().origin !== 'live'
}

/**
 * Swapping in the live adapter is a one-line change here, once a gateway
 * exists. Nothing else in the app needs to know.
 */
export function setAdapter(next: DataAdapter): void {
  active = next
}
