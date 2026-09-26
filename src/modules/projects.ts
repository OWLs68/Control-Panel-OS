/**
 * Projects — and the blockers that hold them up.
 *
 * This is where the context envelope earns its keep: open a project, open a
 * blocker inside it, ask "а чого це заблоковано?" with no other words, and
 * Crow answers about that blocker because the envelope carried its id.
 */
import { reg } from '../core/delegation.js'
import { getSelection, setSelection } from '../core/selection.js'
import { getAdapter, mockAdapter } from '../data/adapters.js'
import { icons } from '../ui/icons.js'
import { badge, card, cardHead, dot, empty, progress, row, sourceTag } from '../ui/primitives.js'
import { escapeHtml } from '../core/dom.js'
import { count } from '../core/plural.js'
import { registerModule, type ModuleContext } from './registry.js'
import { rerenderActiveModule } from './refresh.js'

function render(root: HTMLElement): void {
  const adapter = getAdapter()
  const projects = adapter.projects()
  const blockers = adapter.blockers()
  const agents = adapter.agents().value
  const selection = getSelection()
  const openBlockerId = selection?.entity === 'blocker' ? selection.id : null

  root.innerHTML = `
    <div class="section-label">Проєкти</div>
    ${projects.value.length
      ? projects.value.map((p) => {
          const own = blockers.value.filter((b) => b.projectId === p.id)
          const owner = p.ownerAgentId ? agents.find((a) => a.id === p.ownerAgentId) : undefined
          return card(
            cardHead('projects', p.name, badge(statusLabel(p.status), p.status === 'active' ? 'success' : 'neutral')),
            `<div class="card-row">
               <span class="card-row-body">
                 <span class="card-row-sub">${escapeHtml(p.summary)}</span>
                 <div style="margin-top:10px">${progress(p.progress)}</div>
                 <span class="card-row-sub" style="margin-top:6px;display:block">
                   ${p.progress}% · ${owner ? `веде ${escapeHtml(owner.name)}` : 'без агента'}
                 </span>
               </span>
             </div>
             ${own.map((b) => blockerRow(b.id, b.title, b.detail, b.severity, b.waitingOn, openBlockerId === b.id)).join('')}`,
          )
        }).join('')
      : card(cardHead('projects', 'Проєкти', sourceTag(projects)), empty('projects', 'Проєктів немає', 'Скажи Crow, над чим працюєш.'))}
    <div class="data-notice">${icons.alert}<span>Джерело: ${escapeHtml(projects.origin === 'mock' ? mockAdapter.label : adapter.label)} · ${escapeHtml(projects.source)}</span></div>
  `
}

function blockerRow(
  id: string, title: string, detail: string,
  severity: 'info' | 'warning' | 'critical', waitingOn: string, open: boolean,
): string {
  const tone = severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'info'
  return `${row({
    title,
    sub: open ? `${detail}\nЧекає на: ${waitingOn}` : `Чекає на: ${waitingOn}`,
    lead: dot(severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'idle'),
    trailing: badge(open ? 'відкрито' : 'блокер', tone),
    action: 'toggle-blocker',
    data: { id, label: title },
  })}`
}

const statusLabel = (s: string) => (s === 'active' ? 'активний' : s === 'paused' ? 'на паузі' : 'завершено')

function context(): ModuleContext {
  const adapter = getAdapter()
  const selection = getSelection()
  const blockers = adapter.blockers().value
  const projects = adapter.projects().value

  if (selection?.entity === 'blocker') {
    const blocker = blockers.find((b) => b.id === selection.id)
    if (blocker) {
      const project = projects.find((p) => p.id === blocker.projectId)
      return {
        activeScreen: 'blocker',
        activeEntity: 'blocker',
        selectedItem: blocker.id,
        projectId: blocker.projectId,
        selection: `${project?.name ?? 'проєкт'} › ${blocker.title}`,
        visibleState: [`Проєкт ${project?.name ?? '—'}`, `Блокер «${blocker.title}»`, `Чекає на ${blocker.waitingOn}`],
        blockers: [`${blocker.title}: ${blocker.detail}`],
      }
    }
  }

  return {
    activeScreen: 'projects',
    visibleState: projects.map((p) => `${p.name} — ${p.progress}%, ${statusLabel(p.status)}`),
    blockers: blockers.map((b) => `${b.title} (${projects.find((p) => p.id === b.projectId)?.name ?? '—'})`),
  }
}

function greeting() {
  const blockers = getAdapter().blockers().value
  return {
    title: 'Проєкти',
    text: blockers.length
      ? `${count(blockers.length, 'блокер', 'блокери', 'блокерів')}. Тапни блокер — і питай про нього своїми словами.`
      : 'Блокерів немає, все рухається.',
    priority: (blockers.length ? 'urgent' : 'success') as 'urgent' | 'success',
    chips: [
      { id: 'proj-blocked', label: 'А чого це заблоковано?', action: 'chat' as const, tone: 'accent' as const },
      { id: 'proj-next', label: 'Що далі по Crow OS MP?', action: 'chat' as const },
    ],
  }
}

export function registerProjects(): void {
  reg('toggle-blocker', (data) => {
    if (!data.id) return
    const current = getSelection()
    const isOpen = current?.entity === 'blocker' && current.id === data.id
    setSelection(isOpen ? null : { entity: 'blocker', id: data.id, label: data.label ?? '' })
    rerenderActiveModule()
  })

  registerModule({
    id: 'projects',
    label: 'Проєкти',
    title: 'Проєкти',
    kind: 'ядро',
    group: 'core',
    icon: icons.projects,
    canHide: true,
    defaultOn: true,
    render, context, greeting,
  })
}
