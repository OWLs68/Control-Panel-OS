/**
 * Control — the home screen and the only module that cannot be hidden.
 *
 * Four questions, in the order they get asked on a phone: what needs me, what
 * is moving, is the system healthy, and what is the system made of.
 */
import { relativeTime } from '../core/dom.js'
import { count, plural } from '../core/plural.js'
import { reg } from '../core/delegation.js'
import { getAdapter } from '../data/adapters.js'
import type { Attention, Severity } from '../data/types.js'
import { icons } from '../ui/icons.js'
import { badge, card, cardHead, dot, empty, metric, row, sourceTag } from '../ui/primitives.js'
import { allModules, registerModule, type ModuleContext } from './registry.js'
import { navigate } from './navigate.js'
import { getEnabledModuleIds } from '../nav/module-state.js'

const severityTone = (s: Severity) => (s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'info')
const severityDot = (s: Severity) => (s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'idle')

function render(root: HTMLElement): void {
  const adapter = getAdapter()
  const attention = adapter.attention()
  const agents = adapter.agents()
  const projects = adapter.projects()
  const events = adapter.events(4)

  const working = agents.value.filter((a) => a.task !== null)
  const activeProjects = projects.value.filter((p) => p.status === 'active')
  const doneToday = events.value.filter((e) => Date.now() - e.ts < 24 * 3_600_000).length

  root.innerHTML = `
    <div class="metrics">
      ${metric(attention.value.length, 'Потребує мене', 'alert', 'error')}
      ${metric(working.length, 'У роботі', 'play', 'amber')}
      ${metric(activeProjects.length, 'Проєкти', 'projects', 'success')}
      ${metric(doneToday, 'Сьогодні', 'events', 'info')}
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
        }),
        row({
          title: 'Агенти',
          sub: `${agents.value.filter((a) => a.status === 'online').length} з ${agents.value.length} онлайн`,
          lead: dot(agents.value.some((a) => a.status === 'online') ? 'success' : 'idle'),
        }),
        ...events.value.slice(0, 2).map((e) => row({
          title: e.title,
          sub: `${e.source}${relativeTime(e.ts) ? ` · ${relativeTime(e.ts)}` : ' · щойно'}`,
          lead: dot('idle'),
        })),
      ].join(''),
    )}

    <div class="section-label">Карта системи</div>
    ${card(
      cardHead('map', 'Карта системи'),
      mapRows(),
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

/** What the OS is made of right now, including what is switched off. */
function mapRows(): string {
  const enabled = new Set(getEnabledModuleIds())
  return allModules().map((m) => row({
    title: m.title,
    sub: m.kind,
    lead: `<span class="metric-ico" style="width:28px;height:28px;margin:0;background:var(--ink-soft);color:${enabled.has(m.id) ? 'var(--amber)' : 'var(--secondary)'}">${m.icon}</span>`,
    trailing: enabled.has(m.id)
      ? badge('у панелі', 'amber')
      : badge('схований', 'neutral'),
  })).join('')
}

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
