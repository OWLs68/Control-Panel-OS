/**
 * Bottom sheet — ported from NeverMind.
 *
 * Markup, numbers and the gesture come from the tab selector
 * (`src/core/nav.js:200–274`, `openTabSelector`). The guards on the gesture
 * come from the donor's universal handler (`src/ui/modal-overlay-sync.js:107–140`),
 * which is where its later fixes for the same swipe live. The parts that only
 * matter on an iPhone:
 *
 *   - The dim layer is a TOP-LEVEL SIBLING, never a child of the sheet
 *     (`DESIGN_SYSTEM.md` «Bottom Sheet», UvEHE 03.05). As a child, its blur
 *     gets clipped to the card's composite region the moment the card is
 *     dragged, and the whole thing appears to shrink. The donor's tab selector
 *     still has the blur on its root — that is the bug the rule was written
 *     for, so the rule wins over the one component.
 *   - Three ways out: tap the backdrop, drag the backdrop down, drag the card
 *     down. The touch handler sits on the root, so one handler covers all.
 *   - A drag needs 8px of travel AND more vertical than horizontal (B-138),
 *     otherwise a horizontal swipe on the order strip would drag the card.
 *   - A touch that starts on a field is never a drag (input, textarea, select).
 *   - Only a swipe animates the close: translateY(100%) over 0.3s, then the
 *     nodes go. A tap on the backdrop or on the head's button removes the
 *     sheet at once — the donor's `closeTabSelector` does exactly that.
 *   - `overscroll-behavior: none`, never `contain`: contain still lets the
 *     container itself bounce, which looks like the sheet is squashing.
 */
import { el } from '../core/dom.js'

const CLOSE_DISTANCE = 80                       // nav.js:272 — px of drag that commits to closing
const DRAG_START = 8                            // modal-overlay-sync.js:127 (B-138) — px before a touch is a drag
const CLOSE_MS = 300                            // nav.js:272 — the 0.3s slide-out, then remove
const CLOSE_TRANSITION = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)'   // nav.js:271
const NO_DRAG_FROM = 'input, textarea, select'  // modal-overlay-sync.js:114, minus donor-only classes

export interface SheetOptions {
  id: string
  title: string
  subtitle?: string
  /** HTML for the right side of the head — the donor puts «Готово» there. */
  action?: string
  body: string
  onClose?: () => void
}

export interface SheetHandle {
  root: HTMLElement
  body: HTMLElement
  close: () => void
}

export function openSheet(opts: SheetOptions): SheetHandle {
  closeSheet(opts.id)

  const overlay = el('div', { class: 'sheet-overlay', id: `${opts.id}-overlay` })
  const root = el('div', { class: 'sheet-root', id: opts.id, role: 'dialog', 'aria-modal': 'true' })
  // Donor markup (nav.js:232–245): the handle sits in the head's left column
  // above the title, and the action button is the head's right column.
  root.innerHTML = `
    <div class="sheet" id="${opts.id}-card">
      <div class="sheet-head">
        <div>
          <div class="modal-handle"></div>
          <div class="sheet-title">${opts.title}</div>
          ${opts.subtitle ? `<div class="sheet-sub">${opts.subtitle}</div>` : ''}
        </div>
        ${opts.action ?? ''}
      </div>
      <div class="sheet-body" id="${opts.id}-body">${opts.body}</div>
    </div>`

  document.body.appendChild(overlay)
  document.body.appendChild(root)

  const card = root.querySelector<HTMLElement>('.sheet')
  const body = root.querySelector<HTMLElement>('.sheet-body')
  if (!card || !body) throw new Error('sheet markup missing')

  const remove = () => {
    root.remove()
    overlay.remove()
    opts.onClose?.()
  }

  // Two frames, as in the donor (nav.js:251–256): one for the node to exist,
  // one for the browser to accept the starting transform before the
  // transition runs. One frame and it snaps.
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('open')))

  // Way 1 — tap the backdrop (nav.js:247). The guard keeps a tap inside the
  // card from bubbling up and closing the sheet under the finger.
  root.addEventListener('click', (e) => { if (e.target === root) remove() })

  // Ways 2 and 3 — drag, from the backdrop or from the card.
  attachSwipeClose(root, card, remove)

  return { root, body, close: remove }
}

/**
 * The donor's swipe (nav.js:258–274) with the universal handler's guards
 * (modal-overlay-sync.js:107–140): blocked targets, the 8px start and the
 * vertical-beats-horizontal test.
 */
function attachSwipeClose(root: HTMLElement, card: HTMLElement, remove: () => void): void {
  let startY = 0
  let startX = 0
  let dy = 0
  let blocked = false

  root.addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    if (!t) return
    blocked = !!(e.target as Element | null)?.closest?.(NO_DRAG_FROM)
    startY = t.clientY
    startX = t.clientX
    dy = 0
    if (!blocked) card.style.transition = 'none'
  }, { passive: true })

  root.addEventListener('touchmove', (e) => {
    if (blocked) return
    const t = e.touches[0]
    if (!t) return
    dy = t.clientY - startY
    const dx = Math.abs(t.clientX - startX)
    if (dy > DRAG_START && dy > dx) card.style.transform = `translateY(${dy}px)`
  }, { passive: true })

  root.addEventListener('touchend', () => {
    if (blocked) { blocked = false; return }
    card.style.transition = CLOSE_TRANSITION
    if (dy > CLOSE_DISTANCE) {
      card.style.transform = 'translateY(100%)'
      setTimeout(remove, CLOSE_MS)
    } else {
      card.style.transform = 'translateY(0)'
    }
    dy = 0
  }, { passive: true })
}

export function closeSheet(id: string): void {
  document.getElementById(id)?.remove()
  document.getElementById(`${id}-overlay`)?.remove()
}
