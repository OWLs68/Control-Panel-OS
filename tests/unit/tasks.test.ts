/** The task rules: statuses, the board's groups and order, views without copies. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stampEntity } from '../../src/core/entity.js'
import {
  STATUS_LABEL, TASK_STATUSES, TITLE_MAX, cleanTitle, groupByStatus, isTaskStatus, newTaskFields, tasksFor, waitingOnRoman,
} from '../../src/data/tasks.js'
import type { Task } from '../../src/data/types.js'

/** A stamped task with fixed times: `created` and `updated` are seconds past a fixed minute. */
function task(title: string, over: Partial<Task> = {}, created = 0, updated = created): Task {
  const at = (s: number) => new Date(Date.UTC(2026, 8, 23, 10, 0, s)).toISOString()
  const base = stampEntity({ ...newTaskFields(title), ...over }) as Task
  return { ...base, created_at: at(created), updated_at: at(updated) }
}

test('five statuses, in the order work flows, each with a label', () => {
  assert.deepEqual([...TASK_STATUSES], ['backlog', 'planned', 'in_progress', 'blocked', 'done'])
  for (const status of TASK_STATUSES) assert.ok(STATUS_LABEL[status].length > 0)
})

test('only the five are statuses; needsRoman is not one of them', () => {
  for (const status of TASK_STATUSES) assert.equal(isTaskStatus(status), true)
  for (const other of ['needs_roman', 'todo', 'BACKLOG', '', null, undefined, 3]) assert.equal(isTaskStatus(other), false)
})

test('a title is one trimmed line, capped, and a blank one is nothing', () => {
  assert.equal(cleanTitle('  Купити   молоко \n завтра  '), 'Купити молоко завтра')
  assert.equal(cleanTitle('   \n\t '), null)
  assert.equal(cleanTitle(''), null)
  assert.equal(cleanTitle('я'.repeat(TITLE_MAX + 50))?.length, TITLE_MAX)
})

test('a new task starts in Backlog, waits on nobody and belongs to nothing', () => {
  assert.deepEqual(newTaskFields('Щось'), {
    title: 'Щось', status: 'backlog', needsRoman: false, projectId: null, agentId: null, blockerId: null,
  })
})

test('every task lands in exactly one group, and every group exists even when empty', () => {
  const tasks = [task('a'), task('b', { status: 'done' }), task('c', { status: 'in_progress' })]
  const groups = groupByStatus(tasks)
  assert.deepEqual(Object.keys(groups).sort(), [...TASK_STATUSES].sort())
  assert.equal(TASK_STATUSES.reduce((n, s) => n + groups[s].length, 0), tasks.length)
  assert.deepEqual(groups.planned, [])
  assert.deepEqual(groups.blocked, [])
})

test('a status this build does not know shows in Backlog instead of vanishing', () => {
  const odd = { ...task('з майбутнього'), status: 'someday' as unknown as Task['status'] }
  assert.deepEqual(groupByStatus([odd]).backlog, [odd])
})

test('open groups: waiting on Roman first, then the newest; Done: most recently finished first', () => {
  const old = task('старе', {}, 1)
  const fresh = task('нове', {}, 5)
  const waiting = task('чекає Романа', { needsRoman: true }, 0)
  assert.deepEqual(groupByStatus([old, fresh, waiting]).backlog.map((t) => t.title), ['чекає Романа', 'нове', 'старе'])

  const closedEarly = task('закрито раніше', { status: 'done' }, 9, 10)
  const closedLate = task('закрито пізніше', { status: 'done' }, 1, 20)
  assert.deepEqual(groupByStatus([closedEarly, closedLate]).done.map((t) => t.title), ['закрито пізніше', 'закрито раніше'])
})

test('«Потребує мене» counts what waits on Roman and is not finished', () => {
  const open = task('відкрита', { needsRoman: true, status: 'blocked' })
  const finished = task('закрита', { needsRoman: true, status: 'done' })
  const nobody = task('нікого не чекає')
  assert.deepEqual(waitingOnRoman([open, finished, nobody]), [open])
})

test('views by project or agent are the very same objects, never copies', () => {
  const inProject = task('у проєкті', { projectId: 'p-1' })
  const byAgent = task('в агента', { agentId: 'a-1' })
  const both = task('і те й те', { projectId: 'p-1', agentId: 'a-1' })
  const loose = task('без звʼязків')
  const all = [inProject, byAgent, both, loose]

  const project = tasksFor(all, { projectId: 'p-1' })
  assert.deepEqual(project.map((t) => t.title), ['у проєкті', 'і те й те'])
  assert.ok(project[0] === inProject && project[1] === both)

  assert.deepEqual(tasksFor(all, { agentId: 'a-1' }), [byAgent, both])
  assert.deepEqual(tasksFor(all, { projectId: 'p-1', agentId: 'a-1' }), [both])
  const everything = tasksFor(all)
  assert.ok(everything.every((t, i) => t === all[i]))
})
