/** Memory — what the system remembers about how Roman works. */
import { getAdapter } from '../data/adapters.js'
import type { MemoryFact } from '../data/types.js'
import { relativeTime } from '../core/dom.js'
import { count } from '../core/plural.js'
import { icons } from '../ui/icons.js'
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
      : card(cardHead('memory', 'Факти', sourceTag(memory)), empty('memory', 'Памʼять порожня', 'Crow ще нічого не запамʼятав.'))}
    ${dataNotice('GBrain ще не підключений — це локальні факти, не справжня памʼять системи.')}
  `
}

function context(): ModuleContext {
  const facts = getAdapter().memory().value
  return {
    activeScreen: 'memory',
    visibleState: facts.slice(0, 6).map((f) => f.text),
  }
}

function greeting() {
  const facts = getAdapter().memory().value
  return {
    title: 'Памʼять',
    text: `${count(facts.length, 'факт', 'факти', 'фактів')} локально. GBrain ще не підключений.`,
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
