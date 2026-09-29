/**
 * One agent, on its own screen — the same template for every agent.
 *
 *   back · status, last activity, role and risk · (the newest price card, when
 *   the agent has reported one) · the agent's own events · «Спитати Crow»
 *
 * Read-only: nothing here starts or stops an agent. The screen is data only —
 * what the gateway's registry and the Event Center say — and Shopping Scout's
 * screen is this same one, with its newest `shopping_prices.v1` card above the
 * stream. Donor: NeverMind's project workspace (`projects.js:92–120`) — the
 * list is replaced in place by the item, with a «Назад» row on top (PORTING.md §2).
 */
import { escapeHtml, relativeTime } from '../core/dom.js'
import type { Agent, AgentStatus, Sourced, SystemEvent } from '../data/types.js'
import { eventRow } from '../ui/event-row.js'
import { icons } from '../ui/icons.js'
import { badge, card, cardHead, dot, empty, row, sourceTag } from '../ui/primitives.js'
import { renderShoppingCard } from '../ui/shopping-card.js'

export const statusLabel: Record<AgentStatus, string> = { online: 'онлайн', idle: 'чекає', offline: 'офлайн', unknown: 'немає даних' }
export const statusDot = (s: AgentStatus) => (s === 'online' ? 'success' : s === 'idle' ? 'warning' : 'idle')
export const statusTone = (s: AgentStatus) => (s === 'online' ? 'success' : s === 'idle' ? 'warning' : 'neutral')

const statusHint: Record<AgentStatus, string> = {
  online: 'На звʼязку.',
  idle: 'Чекає наступного запуску.',
  offline: 'Давно не виходив на звʼязок.',
  unknown: 'Gateway ще нічого не знає про цього агента.',
}

const ago = (ts: number) => relativeTime(ts, 60_000) || 'щойно'

/** What the agent last did, as one line — the live word for «task». Null when nothing is known. */
export function activityLine(a: Agent): string | null {
  return a.lastActivity ? `${a.lastActivity.title} · ${ago(a.lastActivity.ts)}` : null
}

export function renderAgentScreen(agent: Agent, agents: Sourced<Agent[]>, events: Sourced<SystemEvent[]>): string {
  const mine = events.value.filter((e) => e.agentId === agent.id)
  const priced = mine.find((e) => e.data)
  const activity = activityLine(agent)
  const live = agents.origin === 'live'

  const facts = [
    row({
      title: 'Статус',
      sub: statusHint[agent.status],
      lead: dot(statusDot(agent.status)),
      trailing: badge(statusLabel[agent.status], statusTone(agent.status)),
    }),
    row({
      title: 'Остання активність',
      sub: live ? (activity ?? 'Немає даних') : (agent.task ?? 'Нічого не робить'),
    }),
    row({ title: 'Роль', sub: `${agent.role} · ${agent.model}`, trailing: badge(agent.risk, 'neutral', true) }),
  ].join('')

  return `
    <button class="screen-back" data-action="agent-back">${icons.chevronLeft}<span>Агенти</span></button>
    ${card(cardHead('agents', agent.name, sourceTag(agents)), facts)}
    ${priced?.data
      ? card(cardHead('wallet', 'Останні ціни', sourceTag(events)), renderShoppingCard(priced.data))
      : ''}
    ${card(
      cardHead('events', 'Події агента', sourceTag(events)),
      mine.length
        ? mine.map((e) => eventRow(e, { card: false })).join('')
        : empty('events', 'Подій ще немає', live ? 'Цей агент ще нічого не повідомив.' : 'У демо-режимі подій агента немає.'),
    )}
    <button class="btn btn-primary btn-block agent-ask" data-action="ask-crow" data-text="${escapeHtml(`Розкажи про агента ${agent.name}: що він робить зараз і чи все з ним гаразд?`)}">${icons.send}Спитати Crow про цього агента</button>
  `
}
