/**
 * Events — the system's own feed, newest first.
 *
 * Live, it is the Event Center on the Mac (the Roma gateway): what Crow/Hermes
 * and the agents reported — started, a result, finished, blocked, an alert —
 * each maybe waiting on Roman. Without the Event Center it is the demo feed,
 * and it says so. The feed is history, not a notification: push and a
 * notification policy come later, on top of it.
 */
import { count } from '../core/plural.js'
import { getAdapter } from '../data/adapters.js'
import type { Sourced, SystemEvent } from '../data/types.js'
import { icons } from '../ui/icons.js'
import { liveNoticeText } from '../ui/live-notice.js'
import { eventRow, eventWhen } from '../ui/event-row.js'
import { card, cardHead, dataNotice, empty, sourceTag } from '../ui/primitives.js'
import { registerModule, type ModuleContext } from './registry.js'

/** Live and fresh, live and stale, or demo — and, in live mode, why it is still demo. */
function notice(events: Sourced<SystemEvent[]>): string {
  if (events.origin === 'live') return dataNotice(liveNoticeText(events))
  if (getAdapter().origin === 'live') {
    return dataNotice('Живих подій ще немає: Event Center на Mac не ввімкнений. Це демо-стрічка.')
  }
  return dataNotice('Демо-режим: це стартові події на телефоні, не справжні. Справжні — у «Наживо».')
}

function render(root: HTMLElement): void {
  const events = getAdapter().events(40)
  root.innerHTML = `
    <div class="section-label">Стрічка подій</div>
    ${events.value.length
      ? card(cardHead('events', 'Події', sourceTag(events)), events.value.map((e) => eventRow(e)).join(''))
      : card(cardHead('events', 'Події', sourceTag(events)), empty('events', 'Подій немає',
          events.origin === 'live' ? 'Жоден агент ще нічого не повідомив.' : 'Система ще нічого не записала.'))}
    ${notice(events)}
  `
}

function context(): ModuleContext {
  const events = getAdapter().events(6)
  // Live Hermes is told when what Roman sees is the demo feed, never handed it as real.
  const demo = getAdapter().origin === 'live' && events.origin !== 'live' ? ' (демо)' : ''
  return {
    activeScreen: 'events',
    visibleState: events.value.map((e) =>
      `${e.title} (${e.source}, ${eventWhen(e)}${e.needsRoman ? ', потребує Романа' : ''})${demo}`),
  }
}

function greeting() {
  const events = getAdapter().events(40)
  const last = events.value[0]
  const waiting = events.origin === 'live' ? events.value.filter((e) => e.needsRoman).length : 0
  const text = !last
    ? 'Стрічка порожня.'
    : waiting
      ? `${count(waiting, 'подія чекає', 'події чекають', 'подій чекає')} на тебе. Останнє: ${last.title}.`
      : `Останнє: ${last.title}. Джерело — ${last.source}.`
  return {
    title: 'Події',
    text,
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
