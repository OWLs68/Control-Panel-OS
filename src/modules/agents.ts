/**
 * Agents — who exists, what is known about each, and at which risk level.
 * Live, the list is the gateway's registry read against the Event Center and
 * Hermes; tapping an agent opens its own screen (agent-screen.ts).
 */
import { reg } from '../core/delegation.js'
import { getSelection, setSelection } from '../core/selection.js'
import { getAdapter } from '../data/adapters.js'
import { icons } from '../ui/icons.js'
import { badge, card, cardHead, dot, empty, row, sourceTag } from '../ui/primitives.js'
import { activityLine, renderAgentScreen, statusDot, statusLabel, statusTone } from './agent-screen.js'
import { registerModule, type ModuleContext } from './registry.js'
import { rerenderActiveModule } from './refresh.js'

function render(root: HTMLElement): void {
  const agents = getAdapter().agents()
  const selection = getSelection()
  const picked = selection?.entity === 'agent' ? agents.value.find((a) => a.id === selection.id) : undefined
  if (picked) {
    root.innerHTML = renderAgentScreen(picked, agents, getAdapter().events(50))
    return
  }

  root.innerHTML = `
    <div class="section-label">Агенти</div>
    ${agents.value.length
      ? card(
          cardHead('agents', 'Агенти', sourceTag(agents)),
          agents.value.map((a) => row({
            title: a.name,
            // Live: what it last did (or that nothing is known); demo: the fixture's task.
            sub: agents.origin === 'live'
              ? `${a.role} · ${a.model}\n${activityLine(a) ?? 'Немає даних'}`
              : `${a.role} · ${a.model}${a.task ? ` · ${a.task}` : ''}`,
            lead: dot(statusDot(a.status)),
            trailing: `${badge(statusLabel[a.status], statusTone(a.status))} ${badge(a.risk, 'neutral', true)}`,
            action: 'select-agent',
            data: { id: a.id, label: a.name },
          })).join(''),
        )
      : card(cardHead('agents', 'Агенти', sourceTag(agents)), empty('agents', 'Агентів немає', 'Жоден агент ще не підключений.'))}
  `
}

function context(): ModuleContext {
  const agents = getAdapter().agents().value
  const selection = getSelection()
  const picked = selection?.entity === 'agent' ? agents.find((a) => a.id === selection.id) : undefined

  if (picked) {
    return {
      activeScreen: 'agent',
      activeEntity: 'agent',
      selectedItem: picked.id,
      agentId: picked.id,
      selection: picked.name,
      visibleState: [
        `${picked.name}: ${statusLabel[picked.status]}`,
        activityLine(picked) ?? picked.task ?? 'без активності',
        `ризик ${picked.risk}`,
      ],
    }
  }
  return {
    activeScreen: 'agents',
    visibleState: agents.map((a) => {
      const doing = activityLine(a) ?? a.task
      return `${a.name}: ${statusLabel[a.status]}${doing ? `, ${doing}` : ''}`
    }),
  }
}

function greeting() {
  const agents = getAdapter().agents().value
  const online = agents.filter((a) => a.status === 'online')
  const offline = agents.filter((a) => a.status === 'offline')
  const unknown = agents.filter((a) => a.status === 'unknown')
  return {
    title: 'Агенти',
    text: `${online.map((a) => a.name).join(' і ') || 'Ніхто'} ${online.length === 1 ? 'працює' : 'працюють'}.` +
      (offline.length ? ` ${offline.map((a) => a.name).join(', ')} ще не підключен${offline.length === 1 ? 'ий' : 'і'}.` : '') +
      (unknown.length ? ` Про ${unknown.map((a) => a.name).join(', ')} даних ще немає.` : ''),
    priority: 'normal' as const,
    chips: [
      { id: 'agents-doing', label: 'Хто чим зайнятий?', action: 'chat' as const, tone: 'accent' as const },
      { id: 'agents-control', label: 'Назад у Control', action: 'nav' as const, target: 'control' },
    ],
  }
}

export function registerAgents(): void {
  // A tap opens the agent's own screen; «Агенти» on that screen brings the list back.
  reg('select-agent', (data) => {
    if (!data.id) return
    setSelection({ entity: 'agent', id: data.id, label: data.label ?? '', agentId: data.id })
    rerenderActiveModule()
  })
  reg('agent-back', () => {
    setSelection(null)
    rerenderActiveModule()
  })

  registerModule({
    id: 'agents',
    label: 'Агенти',
    title: 'Агенти',
    kind: 'ядро',
    group: 'core',
    icon: icons.agents,
    canHide: true,
    defaultOn: true,
    render, context, greeting,
  })
}
