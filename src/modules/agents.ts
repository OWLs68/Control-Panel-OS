/** Agents — who is running, on what, and at which risk level. */
import { reg } from '../core/delegation.js'
import { getSelection, setSelection } from '../core/selection.js'
import { getAdapter } from '../data/adapters.js'
import type { AgentStatus } from '../data/types.js'
import { icons } from '../ui/icons.js'
import { badge, card, cardHead, dot, empty, row, sourceTag } from '../ui/primitives.js'
import { registerModule, type ModuleContext } from './registry.js'
import { rerenderActiveModule } from './refresh.js'

const statusLabel: Record<AgentStatus, string> = { online: 'онлайн', idle: 'чекає', offline: 'офлайн' }
const statusDot = (s: AgentStatus) => (s === 'online' ? 'success' : s === 'idle' ? 'warning' : 'idle')
const statusTone = (s: AgentStatus) => (s === 'online' ? 'success' : s === 'idle' ? 'warning' : 'neutral')

function render(root: HTMLElement): void {
  const agents = getAdapter().agents()
  const openId = getSelection()?.entity === 'agent' ? getSelection()?.id : null

  root.innerHTML = `
    <div class="section-label">Агенти</div>
    ${agents.value.length
      ? card(
          cardHead('agents', 'Агенти', sourceTag(agents)),
          agents.value.map((a) => row({
            title: a.name,
            sub: openId === a.id
              ? `${a.role} · ${a.model}\n${a.task ?? 'нічого не робить'}`
              : `${a.role} · ${a.model}${a.task ? ` · ${a.task}` : ''}`,
            lead: dot(statusDot(a.status)),
            trailing: `${badge(statusLabel[a.status], statusTone(a.status))} ${badge(a.risk, 'neutral', true)}`,
            action: 'toggle-agent',
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
      visibleState: [`${picked.name}: ${statusLabel[picked.status]}`, picked.task ?? 'без задачі', `ризик ${picked.risk}`],
    }
  }
  return {
    activeScreen: 'agents',
    visibleState: agents.map((a) => `${a.name}: ${statusLabel[a.status]}${a.task ? `, ${a.task}` : ''}`),
  }
}

function greeting() {
  const agents = getAdapter().agents().value
  const online = agents.filter((a) => a.status === 'online')
  const offline = agents.filter((a) => a.status === 'offline')
  return {
    title: 'Агенти',
    text: `${online.map((a) => a.name).join(' і ') || 'Ніхто'} ${online.length === 1 ? 'працює' : 'працюють'}.` +
      (offline.length ? ` ${offline.map((a) => a.name).join(', ')} ще не підключен${offline.length === 1 ? 'ий' : 'і'}.` : ''),
    priority: 'normal' as const,
    chips: [
      { id: 'agents-doing', label: 'Хто чим зайнятий?', action: 'chat' as const, tone: 'accent' as const },
      { id: 'agents-control', label: 'Назад у Control', action: 'nav' as const, target: 'control' },
    ],
  }
}

export function registerAgents(): void {
  reg('toggle-agent', (data) => {
    if (!data.id) return
    const current = getSelection()
    const isOpen = current?.entity === 'agent' && current.id === data.id
    setSelection(isOpen ? null : { entity: 'agent', id: data.id, label: data.label ?? '', agentId: data.id })
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
