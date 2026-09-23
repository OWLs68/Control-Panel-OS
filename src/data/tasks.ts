/**
 * Task rules — the native work tracker, first slice.
 *
 * Pure on purpose: nothing here reads or writes storage, so every rule is
 * tested in node (tests/unit/tasks.test.ts). Storage is `taskStore` in
 * stores.ts; screens read through the adapter (`tasks(filter?)`).
 *
 * Five statuses in the order work flows; `needsRoman` is a flag across them,
 * not a sixth status. Views (by project, by agent) return the very same Task
 * objects rather than copies, so an edit in one place is the edit everywhere.
 * No priority, no deadline, no manual order in v1 (Roman, 23.09).
 */
import type { Entity } from '../core/entity.js'
import type { Task, TaskStatus } from './types.js'

/** Top to bottom on the screen, first to last in the flow. */
export const TASK_STATUSES: readonly TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done']

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Беклог',
  planned: 'Заплановано',
  in_progress: 'У роботі',
  blocked: 'Заблоковано',
  done: 'Готово',
}

/** Longer than any title worth reading on a phone; short enough to keep Crow's envelope small. */
export const TITLE_MAX = 200

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

/** One line, trimmed, capped; null when nothing is left to save. */
export function cleanTitle(raw: string): string | null {
  const line = raw.replace(/\s+/g, ' ').trim()
  if (!line) return null
  return line.length > TITLE_MAX ? line.slice(0, TITLE_MAX).trimEnd() : line
}

/** What a new task is before the store stamps its envelope: Backlog, nothing waiting on Roman, no links. */
export function newTaskFields(title: string): Omit<Task, keyof Entity> {
  return { title, status: 'backlog', needsRoman: false, projectId: null, agentId: null, blockerId: null }
}

/** Descending, for ISO timestamps and time-ordered UUIDs alike. */
function desc(a: string, b: string): number {
  return a === b ? 0 : a < b ? 1 : -1
}

/** Waiting on Roman first, then the newest. Ties fall to the id, which is time-ordered (UUID v7). */
function openOrder(a: Task, b: Task): number {
  if (a.needsRoman !== b.needsRoman) return a.needsRoman ? -1 : 1
  return desc(a.created_at, b.created_at) || desc(a.id, b.id)
}

/** The most recently finished first — NeverMind's done list (tasks.js `renderTasks`). */
function doneOrder(a: Task, b: Task): number {
  return desc(a.updated_at, b.updated_at) || desc(a.id, b.id)
}

export type TaskGroups = Record<TaskStatus, Task[]>

/**
 * Every task in exactly one group; every group present, even when empty.
 * A status this build does not know (written by a newer one) shows in
 * Backlog rather than vanishing from the board.
 */
export function groupByStatus(tasks: readonly Task[]): TaskGroups {
  const groups: TaskGroups = { backlog: [], planned: [], in_progress: [], blocked: [], done: [] }
  for (const task of tasks) groups[isTaskStatus(task.status) ? task.status : 'backlog'].push(task)
  for (const status of TASK_STATUSES) groups[status].sort(status === 'done' ? doneOrder : openOrder)
  return groups
}

/** Waiting on Roman and not finished yet — what «Потребує мене» counts. */
export function waitingOnRoman(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => t.needsRoman && t.status !== 'done').sort(openOrder)
}

export interface TaskFilter {
  projectId?: string
  agentId?: string
}

/**
 * A view, not a copy: the same Task objects, filtered. Projects and Agents
 * will show their tasks through this; a task without a project is simply not
 * in any project's view.
 */
export function tasksFor(tasks: readonly Task[], filter: TaskFilter = {}): Task[] {
  return tasks.filter((t) =>
    (filter.projectId === undefined || t.projectId === filter.projectId) &&
    (filter.agentId === undefined || t.agentId === filter.agentId))
}
