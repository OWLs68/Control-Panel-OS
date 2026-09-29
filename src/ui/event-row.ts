/**
 * One event as a row — shared by the «Події» feed and an agent's own screen, so
 * the same event reads the same wherever it appears. With a typed payload
 * (Shopping Scout's prices) the price card sits right under the row; without
 * one it is the row alone, as it always was.
 */
import { relativeTime } from '../core/dom.js'
import type { SystemEvent } from '../data/types.js'
import { badge, dot, row, type Tone } from './primitives.js'
import { renderShoppingCard } from './shopping-card.js'

// The first five are the demo feed's; the agent kinds come from the Event Center.
export const kindLabel: Record<SystemEvent['kind'], string> = {
  deploy: 'деплой', index: 'індекс', backup: 'бекап', agent: 'агент', note: 'запис',
  agent_started: 'почав', agent_result: 'результат', agent_finished: 'завершив', agent_blocked: 'заблоковано', alert: 'важливо',
}
export const kindTone: Record<SystemEvent['kind'], Tone> = {
  deploy: 'info', index: 'amber', backup: 'success', agent: 'info', note: 'neutral',
  agent_started: 'info', agent_result: 'success', agent_finished: 'neutral', agent_blocked: 'warning', alert: 'amber',
}

/** Under a minute is «щойно», not «0 хв тому». */
export const eventWhen = (e: SystemEvent): string => relativeTime(e.ts, 60_000) || 'щойно'

/** `card: false` — the row only: an agent's screen shows the newest card once, above the stream, not under every row. */
export function eventRow(e: SystemEvent, opts: { card?: boolean } = {}): string {
  // «Потребує мене» — the same flag and the same words as on a task. Two
  // badges stack (.card-row-tags) so the title keeps its width.
  const tags = e.needsRoman
    ? `<span class="card-row-tags">${badge('потребує мене', 'error')}${badge(kindLabel[e.kind], kindTone[e.kind])}</span>`
    : badge(kindLabel[e.kind], kindTone[e.kind])
  const line = row({
    title: e.title,
    sub: `${e.detail ? `${e.detail}\n` : ''}${e.source} · ${eventWhen(e)}`,
    lead: e.severity === 'critical' ? dot('error') : e.severity === 'warning' ? dot('warning') : undefined,
    trailing: tags,
  })
  return e.data && opts.card !== false ? `${line}<div class="event-data">${renderShoppingCard(e.data)}</div>` : line
}
