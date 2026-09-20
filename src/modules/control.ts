/**
 * Control — the home screen and the only module that cannot be hidden.
 *
 * Four questions, in the order they get asked on a phone: what needs me, what
 * is moving, is the system healthy, and what is the system made of. Every
 * number on it is a door: the tiles, the rows in «Стан системи» and the nodes
 * of the map all open the module that owns the number.
 */
import { relativeTime } from '../core/dom.js'
import { count, plural } from '../core/plural.js'
import { reg } from '../core/delegation.js'
import { getAdapter } from '../data/adapters.js'
import type { Attention, Severity } from '../data/types.js'
import { icons, type IconName } from '../ui/icons.js'
import { badge, card, cardHead, dot, empty, metric, row, sourceTag } from '../ui/primitives.js'
import { registerModule, type ModuleContext } from './registry.js'
import { navigate } from './navigate.js'

const severityTone = (s: Severity) => (s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'info')
const severityDot = (s: Severity) => (s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'idle')

const DAY = 24 * 3_600_000

function render(root: HTMLElement): void {
  const adapter = getAdapter()
  const attention = adapter.attention()
  const agents = adapter.agents()
  const projects = adapter.projects()
  const events = adapter.events(4)

  const working = agents.value.filter((a) => a.task !== null)
  const activeProjects = projects.value.filter((p) => p.status === 'active')
  const doneToday = events.value.filter((e) => Date.now() - e.ts < DAY).length

  root.innerHTML = `
    <div class="metrics">
      ${metric(attention.value.length, 'Потребує мене', 'alert', 'error', { action: 'open-module', data: { module: 'projects' } })}
      ${metric(working.length, 'У роботі', 'play', 'amber', { action: 'open-module', data: { module: 'agents' } })}
      ${metric(activeProjects.length, 'Проєкти', 'projects', 'success', { action: 'open-module', data: { module: 'projects' } })}
      ${metric(doneToday, 'Сьогодні', 'events', 'info', { action: 'open-module', data: { module: 'events' } })}
    </div>

    <div class="section-label">Потребує мене</div>
    ${attention.value.length
      ? card(
          cardHead('alert', 'Потребує мене', sourceTag(attention)),
          attention.value.map(attentionRow).join(''),
        )
      : card(cardHead('alert', 'Потребує мене', sourceTag(attention)),
          empty('check', 'Нічого не чекає', 'Жодне рішення не заблоковане на тобі.'))}

    <div class="section-label">У роботі</div>
    ${card(
      cardHead('play', 'У роботі', sourceTag(agents)),
      working.length
        ? working.map((a) => row({
            title: a.name,
            sub: a.task ?? '',
            lead: dot(a.status === 'online' ? 'success' : 'idle'),
            trailing: badge(a.risk, 'neutral', true),
            action: 'open-agent',
            data: { id: a.id, label: a.name },
          })).join('')
        : empty('clock', 'Тиша', 'Жоден агент зараз нічого не робить.'),
    )}

    <div class="section-label">Стан системи</div>
    ${card(
      cardHead('bolt', 'Стан системи', sourceTag(events)),
      [
        row({
          title: 'Hermes',
          sub: 'Gateway ще не підключений — інтерфейс працює на заглушці',
          lead: dot('warning'),
          trailing: badge('заглушка', 'warning'),
          action: 'ask-crow',
          data: { text: 'Що з Hermes?' },
        }),
        row({
          title: 'Агенти',
          sub: `${agents.value.filter((a) => a.status === 'online').length} з ${agents.value.length} онлайн`,
          lead: dot(agents.value.some((a) => a.status === 'online') ? 'success' : 'idle'),
          action: 'open-module',
          data: { module: 'agents' },
        }),
        ...events.value.slice(0, 2).map((e) => row({
          title: e.title,
          sub: `${e.source}${relativeTime(e.ts) ? ` · ${relativeTime(e.ts)}` : ' · щойно'}`,
          lead: dot('idle'),
          action: 'open-module',
          data: { module: 'events' },
        })),
      ].join(''),
    )}

    <div class="section-label">Карта системи</div>
    ${card(
      cardHead('map', 'Карта системи'),
      `<div class="map">${systemMap()}</div>`,
    )}
  `
}

function attentionRow(a: Attention): string {
  return row({
    title: a.title,
    sub: a.detail,
    lead: dot(severityDot(a.severity)),
    trailing: badge(a.risk, severityTone(a.severity), true),
    action: 'open-attention',
    data: { id: a.id, module: a.moduleId, entity: a.entityId ?? '', label: a.title },
  })
}

/* ── The map ─────────────────────────────────────────────────────────── */

type Edge = 'live' | 'stub' | 'blocked'

interface MapNode {
  x: number; y: number; r: number
  fill: string
  icon: IconName
  name: string
  sub: string
  /** Where the sub-label's colour comes from when it is not the usual grey. */
  subTone?: string
  /** The label sits a little off-centre on the side nodes, as in the mockup. */
  shift: number
  module: string
  edge: Edge
  /** Where the line from the core ends: just short of the node, as drawn. */
  end: [number, number]
}

/**
 * The system map, drawn the way `mockup.html` draws it: the core in the
 * middle, the parts of the OS on a ring around it, and the lines say how they
 * are wired — solid when the connection is live, dashed when it is a stub,
 * red when a blocker sits on it. Positions are the mockup's numbers; only the
 * counts and the line states come from the data. Every node opens its module.
 */
function systemMap(): string {
  const adapter = getAdapter()
  const agents = adapter.agents().value
  const online = agents.filter((a) => a.status === 'online').length
  const active = adapter.projects().value.filter((p) => p.status === 'active').length
  const today = adapter.events(40).value.filter((e) => Date.now() - e.ts < DAY).length
  const facts = adapter.memory().value.length
  const critical = adapter.attention().value.filter((a) => a.severity === 'critical').length

  const nodes: MapNode[] = [
    { x: 95, y: 30, r: 15, fill: 'var(--success)', icon: 'agents', name: 'Агенти',
      sub: count(online, 'активний', 'активні', 'активних'), shift: 0, module: 'agents',
      edge: online ? 'live' : 'stub', end: [95, 34] },
    { x: 37, y: 62, r: 14, fill: 'var(--amber)', icon: 'projects', name: 'Проєкти',
      sub: `${active} у роботі`, shift: -7, module: 'projects', edge: 'live', end: [41, 62] },
    { x: 153, y: 62, r: 14, fill: 'var(--info)', icon: 'events', name: 'Події',
      sub: `${today} сьогодні`, shift: 7, module: 'events', edge: 'live', end: [149, 62] },
    { x: 45, y: 138, r: 14, fill: 'var(--error)', icon: 'lock', name: 'Доступи',
      sub: critical ? count(critical, 'блокер', 'блокери', 'блокерів') : 'ок',
      subTone: critical ? 'var(--error)' : undefined,
      shift: -7, module: 'projects', edge: critical ? 'blocked' : 'live', end: [49, 134] },
    { x: 145, y: 138, r: 14, fill: 'var(--secondary)', icon: 'memory', name: 'Памʼять',
      sub: count(facts, 'факт', 'факти', 'фактів'), shift: 7, module: 'memory',
      edge: 'stub', end: [141, 134] },   // GBrain is not connected yet
  ]

  const line = (n: MapNode) => {
    const style = n.edge === 'blocked'
      ? 'stroke:var(--error);stroke-width:1.8'
      : n.edge === 'stub'
        ? 'stroke:var(--secondary);stroke-width:1.4;stroke-dasharray:2 4'
        : 'stroke:var(--primary);stroke-width:1.6'
    return `<path d="M95 92 L${n.end[0]} ${n.end[1]}" style="${style}"/>`
  }

  const node = (n: MapNode) => `
    <g class="map-node" data-action="open-module" data-module="${n.module}" role="button" tabindex="0" aria-label="${n.name}">
      <circle cx="${n.x}" cy="${n.y}" r="${n.r}" style="fill:${n.fill}"/>
      ${icons[n.icon].replace('<svg ', `<svg x="${n.x - 8}" y="${n.y - 8}" width="16" height="16" style="color:#fff" `)}
      <text x="${n.x + n.shift}" y="${n.y + 26}" text-anchor="middle" font-size="9.5" font-weight="700" style="fill:var(--text)">${n.name}</text>
      <text x="${n.x + n.shift}" y="${n.y + 35}" text-anchor="middle" font-size="8" style="fill:${n.subTone ?? 'var(--text-2)'}">${n.sub}</text>
    </g>`

  return `
    <svg viewBox="0 0 190 200" role="img" aria-label="Карта системи Roma OS">
      <circle cx="95" cy="92" r="62" fill="none" style="stroke:var(--border)" stroke-width="1.2"/>
      ${nodes.map(line).join('')}
      <g class="map-node map-core" data-action="ask-crow" data-text="Як справи в системі?" role="button" tabindex="0" aria-label="Roma OS">
        <circle cx="95" cy="92" r="27" style="fill:var(--primary)"/>
        <text x="95" y="89" text-anchor="middle" font-size="11" font-weight="800" style="fill:var(--surface)">Roma</text>
        <text x="95" y="100" text-anchor="middle" font-size="11" font-weight="800" style="fill:var(--amber)">OS</text>
      </g>
      ${nodes.map(node).join('')}
    </svg>`
}

/* ── Context and greeting ────────────────────────────────────────────── */

function context(): ModuleContext {
  const adapter = getAdapter()
  const attention = adapter.attention().value
  const working = adapter.agents().value.filter((a) => a.task !== null)
  return {
    activeScreen: 'control',
    visibleState: [
      `${count(attention.length, 'річ потребує', 'речі потребують', 'речей потребує')} Романа`,
      `${count(working.length, 'агент', 'агенти', 'агентів')} у роботі`,
      'Hermes: заглушка, реального gateway немає',
    ],
    blockers: attention.map((a) => `${a.title} (${a.risk}): ${a.detail}`),
  }
}

function greeting() {
  const attention = getAdapter().attention().value
  const worst = attention[0]
  return {
    title: 'Привіт!',
    text: worst
      ? `${count(attention.length, 'річ', 'речі', 'речей')} ${plural(attention.length, 'чекає', 'чекають', 'чекає')} на тебе, найгостріше — «${worst.title}».`
      : 'Нічого не чекає на тебе. Система працює сама.',
    priority: (worst?.severity === 'critical' ? 'urgent' : 'normal') as 'urgent' | 'normal',
    chips: [
      { id: 'control-what', label: 'Що потребує мене?', action: 'chat' as const, tone: 'accent' as const },
      { id: 'control-agents', label: 'Що роблять агенти?', action: 'chat' as const },
      { id: 'control-projects', label: 'Відкрий проєкти', action: 'nav' as const, target: 'projects' },
    ],
  }
}

export function registerControl(): void {
  reg('open-attention', (data) => {
    const moduleId = data.module || 'projects'
    navigate(
      data.entity
        ? { moduleId, select: { entity: 'blocker', id: data.entity, label: data.label ?? '' } }
        : { moduleId },
    )
  })
  reg('open-agent', (data) => {
    if (!data.id) return
    navigate({ moduleId: 'agents', select: { entity: 'agent', id: data.id, label: data.label ?? '', agentId: data.id } })
  })

  registerModule({
    id: 'control',
    label: 'Control',
    title: 'Control',
    kind: 'ядро · головна',
    group: 'core',
    icon: icons.home,
    canHide: false,     // the home screen; hiding it would leave nowhere to land
    defaultOn: true,
    render, context, greeting,
  })
}
