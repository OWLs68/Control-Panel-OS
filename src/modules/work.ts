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
 * «локально», never seeded and never touched by the demo reset.
 *
 * Writing is two card modals, the settings pattern (card-modal.ts + the
 * measured 52px rows of modal-row.ts): «Нова задача» asks for a title only and
 * files it in Беклог; a tap on a task selects it (Crow's envelope carries it)
 * and opens its card — five status rows, a tap moves the task and closes the
 * card, and the «Потребує мене» switch, which leaves it open. No title edit,
 * no delete, no links in this slice.
 */
import { reg } from '../core/delegation.js'
import { escapeHtml } from '../core/dom.js'
import { count, plural } from '../core/plural.js'
import { getSelection, setSelection } from '../core/selection.js'
import { getAdapter } from '../data/adapters.js'
import { taskStore } from '../data/stores.js'
import { STATUS_LABEL, TASK_STATUSES, TITLE_MAX, cleanTitle, groupByStatus, isTaskStatus, newTaskFields, waitingOnRoman } from '../data/tasks.js'
import type { Sourced, Task, TaskStatus } from '../data/types.js'
import { closeCardModal, openCardModal, type CardModalHandle } from '../ui/card-modal.js'
import { icons, type IconName } from '../ui/icons.js'
import { modalRow, modalToggle } from '../ui/modal-row.js'
import { badge, card, cardHead, dot, empty, metric, row, sourceTag } from '../ui/primitives.js'
import { showToast } from '../ui/toast.js'
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
    <button type="button" class="btn btn-primary btn-block task-new" data-action="task-new">Нова задача</button>
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

/* ── The two cards ───────────────────────────────────────────────────── */

const NEW_ID = 'task-new-modal'
const CARD_ID = 'task-card-modal'
const CURRENT = `<span class="s-current" aria-hidden="true">${icons.check}</span>`

let modal: CardModalHandle | null = null

function open(id: string, body: string): CardModalHandle {
  const handle = openCardModal({ id, body, onClose: () => { if (modal === handle) modal = null } })
  modal = handle
  return handle
}

function closeCards(): void {
  if (modal) modal.close()
  closeCardModal(NEW_ID)
  closeCardModal(CARD_ID)
}

/**
 * NeverMind's task modal asks for a title (index.html:1216) and focuses it
 * 350ms later; here the focus happens inside the tap that opened the card,
 * because iOS raises the keyboard only for a focus made during a user gesture
 * — the chat's «+» does the same (shell.ts `openChatWithFocus`).
 */
function openNewTask(): void {
  const handle = open(NEW_ID, `
    <div class="settings-handle"></div>
    <div class="settings-title">Нова задача</div>
    <div class="settings-version">Стане в «Беклог» · локально</div>
    <div class="modal-scroll">
      <div class="s-group">
        <div class="s-row s-row-static s-row-column">
          <input class="settings-input task-title-input" type="text" id="task-new-title" maxlength="${TITLE_MAX}"
            placeholder="Назва задачі…" aria-label="Назва задачі" autocomplete="off" enterkeyhint="done"
            data-on-enter="task-create">
        </div>
      </div>
      <div class="task-form-actions">
        <button type="button" class="btn btn-primary btn-block" data-action="task-create">Створити</button>
      </div>
    </div>`)
  handle.root.querySelector<HTMLInputElement>('#task-new-title')?.focus()
}

function statusRow(task: Task, status: TaskStatus): string {
  const current = task.status === status
  return modalRow({
    action: 'task-set-status', icon: icons[STATUS_ICON[status]], tone: current ? 'amber' : 'ink',
    title: STATUS_LABEL[status], right: current ? CURRENT : '', pressed: current,
    data: { id: task.id, status },
  })
}

function needsRomanRow(task: Task): string {
  return modalRow({
    action: 'task-toggle-roman', id: 'task-roman-row', icon: icons.alert, tone: task.needsRoman ? 'amber' : 'ink',
    title: 'Потребує мене',
    sub: task.needsRoman ? 'Без тебе не рухається' : 'Позначити, що чекає твого рішення',
    right: modalToggle(task.needsRoman), checked: task.needsRoman,
    data: { id: task.id },
  })
}

function openTaskCard(task: Task): void {
  open(CARD_ID, `
    <div class="settings-handle"></div>
    <div class="settings-title task-card-title">${escapeHtml(task.title)}</div>
    <div class="settings-version">${escapeHtml(STATUS_LABEL[task.status] ?? task.status)} · локально</div>
    <div class="modal-scroll">
      <div class="s-group-label">Статус</div>
      <div class="s-group">${TASK_STATUSES.map((s) => statusRow(task, s)).join('')}</div>
      <div class="s-group">${needsRomanRow(task)}</div>
    </div>`)
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
  reg('open-task', (data) => {
    const task = data.id ? openTask(data.id) : undefined
    if (task) openTaskCard(task)
  })

  reg('task-new', openNewTask)

  // The button and Enter in the field both land here.
  reg('task-create', () => {
    const input = document.getElementById('task-new-title') as HTMLInputElement | null
    const title = cleanTitle(input?.value ?? '')
    if (!title) {
      showToast('Введи назву задачі')
      input?.focus()
      return
    }
    taskStore.put(newTaskFields(title))
    closeCards()
  })

  // A tap on a status moves the task and closes the card: the move is the answer.
  reg('task-set-status', (data) => {
    const status = data.status
    const task = data.id ? taskStore.get(data.id) : undefined
    if (task && isTaskStatus(status) && task.status !== status) taskStore.update(task.id, { status })
    closeCards()
  })

  // The switch leaves the card open; the board under it redraws on its own.
  reg('task-toggle-roman', (data) => {
    const task = data.id ? taskStore.get(data.id) : undefined
    if (!task) return
    const next = taskStore.update(task.id, { needsRoman: !task.needsRoman })
    const rowEl = document.getElementById('task-roman-row')
    if (next && rowEl) rowEl.outerHTML = needsRomanRow(next)
  })

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
