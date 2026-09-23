/**
 * «Задачі» — the native work tracker, first slice (module id `work`).
 *
 * A board on a phone: the five statuses as groups, top to bottom and always
 * all five, so the whole flow is one scroll. No columns and no drag: NeverMind
 * dropped long-press drag-and-drop for buttons in a modal (finance.js:276–278),
 * and the same holds here. `needsRoman` is a flag across the groups, counted
 * by the first tile and marked on the row.
 *
 * Tasks are Roman's own from the first one: kept on this device, marked
 * «локально», never seeded and never touched by the demo reset. A tap selects
 * a task, so Crow's envelope carries it.
 */
import { reg } from '../core/delegation.js'
import { count, plural } from '../core/plural.js'
import { getSelection, setSelection } from '../core/selection.js'
import { getAdapter } from '../data/adapters.js'
import { STATUS_LABEL, TASK_STATUSES, groupByStatus, waitingOnRoman } from '../data/tasks.js'
import type { Sourced, Task, TaskStatus } from '../data/types.js'
import { icons, type IconName } from '../ui/icons.js'
import { badge, card, cardHead, dot, empty, metric, row, sourceTag } from '../ui/primitives.js'
import { registerModule, type CrowGreeting, type ModuleContext } from './registry.js'
import { rerenderActiveModule } from './refresh.js'

const STATUS_ICON: Record<TaskStatus, IconName> = {
  backlog: 'note', planned: 'clock', in_progress: 'play', blocked: 'lock', done: 'check',
}
const STATUS_DOT: Record<TaskStatus, 'success' | 'warning' | 'error' | 'idle'> = {
  backlog: 'idle', planned: 'idle', in_progress: 'success', blocked: 'error', done: 'idle',
}

function selectedTask(tasks: readonly Task[]): Task | undefined {
  const selection = getSelection()
  return selection?.entity === 'task' ? tasks.find((t) => t.id === selection.id) : undefined
}

function render(root: HTMLElement): void {
  const tasks = getAdapter().tasks()
  const groups = groupByStatus(tasks.value)
  const openId = selectedTask(tasks.value)?.id ?? null
  const boardEmpty = tasks.value.length === 0

  root.innerHTML = `
    <div class="metrics">
      ${metric(waitingOnRoman(tasks.value).length, 'Потребує мене', 'alert', 'error')}
      ${metric(groups.in_progress.length, 'У роботі', 'play', 'amber')}
      ${metric(groups.blocked.length, 'Заблоковано', 'lock', 'warning')}
      ${metric(groups.done.length, 'Готово', 'check', 'success')}
    </div>
    ${TASK_STATUSES.map((status) => groupCard(status, groups[status], tasks, openId, boardEmpty)).join('')}
  `
}

/**
 * One status: its name and count, then its tasks — or a quiet line when there
 * are none. The board has one source, so «локально» is said once, on the
 * first group, not five times.
 */
function groupCard(status: TaskStatus, list: Task[], src: Sourced<Task[]>, openId: string | null, boardEmpty: boolean): string {
  const tag = status === TASK_STATUSES[0] ? ` ${sourceTag(src)}` : ''
  const head = cardHead(STATUS_ICON[status], STATUS_LABEL[status], `${badge(String(list.length), 'neutral', true)}${tag}`)
  if (list.length) return card(head, list.map((t) => taskRow(t, t.id === openId)).join(''))
  if (boardEmpty && status === 'backlog') {
    return card(head, empty('check', 'Задач ще немає', 'Нова задача стає в «Беклог».'))
  }
  return card(head, '<div class="task-group-empty">Порожньо</div>')
}

function taskRow(task: Task, open: boolean): string {
  const tags = [
    task.needsRoman && task.status !== 'done' ? badge('потребує мене', 'error') : '',
    open ? badge('відкрито', 'info') : '',
  ].filter(Boolean).join(' ')
  return row({
    title: task.title,
    lead: dot(STATUS_DOT[task.status] ?? 'idle'),
    trailing: tags,
    action: 'open-task',
    data: { id: task.id, label: task.title },
    ...(task.status === 'done' ? { className: 'is-done' } : {}),
  })
}

/* ── Context and greeting ────────────────────────────────────────────── */

function context(): ModuleContext {
  const tasks = getAdapter().tasks().value
  const picked = selectedTask(tasks)
  if (picked) {
    return {
      activeScreen: 'task',
      activeEntity: 'task',
      selectedItem: picked.id,
      projectId: picked.projectId,
      agentId: picked.agentId,
      selection: picked.title,
      visibleState: [`статус: ${STATUS_LABEL[picked.status] ?? picked.status}`, ...(picked.needsRoman ? ['потребує Романа'] : [])],
    }
  }
  const groups = groupByStatus(tasks)
  const waiting = waitingOnRoman(tasks)
  return {
    activeScreen: 'work',
    visibleState: [
      `задач: ${tasks.length}; чекають Романа: ${waiting.length}`,
      TASK_STATUSES.map((s) => `${STATUS_LABEL[s]}: ${groups[s].length}`).join(', '),
      ...waiting.slice(0, 5).map((t) => `потребує Романа: ${t.title}`),
    ],
  }
}

function greeting(): CrowGreeting {
  const tasks = getAdapter().tasks().value
  const waiting = waitingOnRoman(tasks)
  const first = waiting[0]
  const inWork = tasks.filter((t) => t.status === 'in_progress').length
  return {
    title: 'Задачі',
    text: !tasks.length
      ? 'Задач ще немає. Нова задача стає в «Беклог».'
      : first
        ? `${count(waiting.length, 'задача', 'задачі', 'задач')} ${plural(waiting.length, 'чекає', 'чекають', 'чекає')} на тебе, перша — «${first.title}».`
        : `У роботі ${inWork}. На тебе нічого не чекає.`,
    priority: first ? 'urgent' : 'normal',
    chips: [{ id: 'work-first', label: 'Що мені зробити першим?', action: 'chat', tone: 'accent' }],
  }
}

/* ── Wiring ──────────────────────────────────────────────────────────── */

/** Select a task: its row says «відкрито», and the next message to Crow carries it. */
function openTask(id: string): Task | undefined {
  const task = getAdapter().tasks().value.find((t) => t.id === id)
  if (!task) return undefined
  setSelection({
    entity: 'task', id: task.id, label: task.title,
    ...(task.projectId ? { projectId: task.projectId } : {}),
    ...(task.agentId ? { agentId: task.agentId } : {}),
  })
  rerenderActiveModule()
  return task
}

export function registerWork(): void {
  reg('open-task', (data) => { if (data.id) openTask(data.id) })

  registerModule({
    id: 'work',
    label: 'Задачі',
    title: 'Задачі',
    kind: 'система · задачі',
    group: 'core',
    icon: icons.tasks,
    canHide: true,
    defaultOn: true,
    render, context, greeting,
  })
}
