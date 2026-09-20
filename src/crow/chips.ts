/**
 * Chips — NeverMind's `owl/chips.js`, the part that applies here.
 *
 * The donor's control question, kept: does this chip save typing? If not it is
 * decoration and it goes. Everything here follows from that —
 *
 *   - a `nav` chip pointing at the module you are already on is dropped, since
 *     tapping it would look broken (chips.js, the currentTab filter);
 *   - a `chat` chip's label is Roman's own words, so it can be sent to Crow
 *     verbatim as if he had typed it;
 *   - a tapped chip locks immediately, fades (opacity 0, scale 0.8, 200ms) and
 *     is removed until the next board — the 200ms is long enough for a second
 *     tap to fire the same action twice, hence the lock (64CXo);
 *   - the board's strip ends with «Поговорити» (`owl-chip-speak`), the one chip
 *     that opens the chat instead of sending anything. It is not locked after a
 *     tap: the donor locks it too, which leaves it dead until the next render.
 */
import { escapeHtml } from '../core/dom.js'
import { getActiveModuleId } from '../core/selection.js'
import type { CrowChip } from '../hermes/contract.js'

export interface ChipHandlers {
  onChat: (label: string) => void
  onNav: (moduleId: string) => void
  onOpen: (id: string, label: string) => void
  /** «Поговорити», and the swipe down on the open board: open the chat. */
  onSpeak?: () => void
}

export interface ChipOptions {
  /** Append the donor's «Поговорити» chip (board.js: `showSpeak`). */
  speak?: boolean
}

const LEAVE_MS = 200   // chips.js — the fade before the chip is removed

export function renderChips(container: HTMLElement, chips: CrowChip[], handlers: ChipHandlers, options: ChipOptions = {}): void {
  const visible = chips.filter((c) => !(c.action === 'nav' && c.target === getActiveModuleId()))

  if (!visible.length && !options.speak) { container.innerHTML = ''; return }

  const html = visible.map((c) => {
    const tone = c.tone === 'accent' ? ' chip-accent' : c.tone === 'danger' ? ' chip-danger' : ''
    return `<button class="chip${tone}" data-chip-id="${escapeHtml(c.id)}"
      data-chip-action="${escapeHtml(c.action)}"
      data-chip-target="${escapeHtml(c.target ?? '')}"
      data-chip-label="${escapeHtml(c.label)}">${escapeHtml(c.label)}</button>`
  })
  if (options.speak) html.push('<button class="chip chip-speak" data-chip-action="speak">Поговорити</button>')

  container.innerHTML = html.join('')
  container.scrollLeft = 0

  // One delegated handler per container, replaced on each render.
  const existing = (container as HTMLElement & { _chipHandler?: EventListener })._chipHandler
  if (existing) container.removeEventListener('click', existing)

  const handler: EventListener = (ev) => {
    const chip = (ev.target as Element | null)?.closest<HTMLElement>('.chip')
    if (!chip) return

    if (chip.dataset.chipAction === 'speak') { handlers.onSpeak?.(); return }

    const locked = chip as HTMLElement & { _fired?: boolean }
    if (locked._fired) return
    locked._fired = true
    chip.style.pointerEvents = 'none'
    chip.classList.add('is-leaving')
    setTimeout(() => chip.remove(), LEAVE_MS)

    const label = chip.dataset.chipLabel ?? ''
    const target = chip.dataset.chipTarget ?? ''
    switch (chip.dataset.chipAction) {
      case 'nav': if (target) handlers.onNav(target); break
      case 'open': if (target) handlers.onOpen(target, label); break
      default: handlers.onChat(label)
    }
  }
  ;(container as HTMLElement & { _chipHandler?: EventListener })._chipHandler = handler
  container.addEventListener('click', handler)
}

/** Shows the arrows only when there is actually something off-screen (board.js:98). */
export function updateChipArrows(strip: HTMLElement, left: HTMLElement, right: HTMLElement): void {
  left.classList.toggle('visible', strip.scrollLeft > 4)
  right.classList.toggle('visible', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4)
}
