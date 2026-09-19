/** Events — the system's own feed, newest first. */
import { relativeTime } from '../core/dom.js'
import { getAdapter } from '../data/adapters.js'
import type { SystemEvent } from '../data/types.js'
import { icons } from '../ui/icons.js'
import { badge, card, cardHead, empty, row, sourceTag } from '../ui/primitives.js'
import { registerModule, type ModuleContext } from './registry.js'

const kindLabel: Record<SystemEvent['kind'], string> = {
  deploy: 'деплой', index: 'індекс', backup: 'бекап', agent: 'агент', note: 'запис',
}
const kindTone: Record<SystemEvent['kind'], 'info' | 'success' | 'neutral' | 'amber'> = {
  deploy: 'info', index: 'amber', backup: 'success', agent: 'info', note: 'neutral',
}

function render(root: HTMLElement): void {
  const events = getAdapter().events(40)
  root.innerHTML = `
    <div class="section-label">Стрічка подій</div>
    ${events.value.length
      ? card(
          cardHead('events', 'Події', sourceTag(events)),
          events.value.map((e) => row({
            title: e.title,
            sub: `${e.detail}\n${e.source} · ${relativeTime(e.ts, 0) || 'щойно'}`,
            trailing: badge(kindLabel[e.kind], kindTone[e.kind]),
          })).join(''),
        )
      : card(cardHead('events', 'Події', sourceTag(events)), empty('events', 'Подій немає', 'Система ще нічого не записала.'))}
  `
}

function context(): ModuleContext {
  const events = getAdapter().events(6).value
  return {
    activeScreen: 'events',
    visibleState: events.map((e) => `${e.title} (${e.source}, ${relativeTime(e.ts, 0) || 'щойно'})`),
  }
}

function greeting() {
  const events = getAdapter().events(1).value
  const last = events[0]
  return {
    title: 'Події',
    text: last ? `Останнє: ${last.title}. Джерело — ${last.source}.` : 'Стрічка порожня.',
    priority: 'normal' as const,
    chips: [
      { id: 'events-today', label: 'Що було сьогодні?', action: 'chat' as const, tone: 'accent' as const },
    ],
  }
}

export function registerEvents(): void {
  registerModule({
    id: 'events',
    label: 'Події',
    title: 'Події',
    kind: 'ядро · стрічка',
    group: 'core',
    icon: icons.events,
    canHide: true,
    defaultOn: true,
    render, context, greeting,
  })
}
