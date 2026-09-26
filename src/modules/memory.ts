/** Memory — what the system remembers about how Roman works. */
import { getAdapter } from '../data/adapters.js'
import { liveStatus } from '../data/live-adapter.js'
import type { MemoryFact, Sourced } from '../data/types.js'
import { relativeTime } from '../core/dom.js'
import { count } from '../core/plural.js'
import { icons } from '../ui/icons.js'
import { liveNoticeText } from '../ui/live-notice.js'
import { badge, card, cardHead, dataNotice, empty, row, sourceTag } from '../ui/primitives.js'
import { registerModule, type ModuleContext } from './registry.js'

const categoryLabel: Record<MemoryFact['category'], string> = {
  system: 'система', project: 'проєкт', person: 'люди', preference: 'смаки',
}

function render(root: HTMLElement): void {
  const memory = getAdapter().memory()
  root.innerHTML = `
    <div class="section-label">Памʼять</div>
    ${memory.value.length
      ? card(
          cardHead('memory', 'Факти', sourceTag(memory)),
          memory.value.map((f) => row({
            title: f.text,
            sub: relativeTime(f.ts, 0) || 'щойно',
            trailing: badge(categoryLabel[f.category], 'neutral'),
          })).join(''),
        )
      : card(cardHead('memory', 'Факти', sourceTag(memory)), empty('memory', 'Памʼять порожня',
          memory.origin === 'live' ? 'GBrain ще нічого не віддав.' : 'Crow ще нічого не запамʼятав.'))}
    ${notice(memory)}
  `
}

/** What the reader is looking at: fixtures, fresh GBrain, or the last snapshot and why. */
function notice(memory: Sourced<MemoryFact[]>): string {
  if (memory.origin === 'mock') {
    return dataNotice('Демо-режим: це стартові факти на телефоні, не памʼять GBrain. Справжня — у «Наживо».')
  }
  return dataNotice(liveNoticeText(memory))
}

function context(): ModuleContext {
  const facts = getAdapter().memory().value
  return {
    activeScreen: 'memory',
    visibleState: facts.slice(0, 6).map((f) => f.text),
  }
}

function greeting() {
  const memory = getAdapter().memory()
  const facts = memory.value
  const text = memory.origin === 'live'
    ? `${count(facts.length, 'факт', 'факти', 'фактів')} із GBrain${liveStatus().stale ? ' · дані застарілі' : ''}.`
    : `${count(facts.length, 'факт', 'факти', 'фактів')} — демо. Памʼять GBrain — у «Наживо».`
  return {
    title: 'Памʼять',
    text,
    priority: 'normal' as const,
    chips: [
      { id: 'mem-what', label: 'Що ти про мене знаєш?', action: 'chat' as const, tone: 'accent' as const },
    ],
  }
}

export function registerMemory(): void {
  registerModule({
    id: 'memory',
    label: 'Памʼять',
    title: 'Памʼять',
    kind: 'ядро · GBrain',
    group: 'core',
    icon: icons.memory,
    canHide: true,
    defaultOn: false,   // off by default in the mockup; switched on in the sheet
    render, context, greeting,
  })
}
