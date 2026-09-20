/**
 * Card modal — NeverMind's second modal pattern, ported.
 *
 * The donor's settings panel (`index.html:1256–1258`, `nav.js:734–840`
 * `openSettings`/`closeSettings`) and its calendar modal share one shape,
 * written up in `docs/DESIGN_SYSTEM.md` «Bottom Sheet Modal — ЕТАЛОН
 * calendar-modal»: a dim layer as a top-level sibling, a root pinned to the
 * bottom with 16px around it, and a glass card that pops in with `scale(0→1)`
 * over 0.35s on the overshoot curve. The bottom sheet in `sheet.ts` slides;
 * this one scales. Both exist in the donor, for different surfaces.
 *
 * The parts that only matter on an iPhone:
 *   - Open: dim → root → one frame → scale(1). Close: scale(0) → 300ms →
 *     the nodes go. The donor toggles display:none on static markup; ours is
 *     built per open, so removal does the same job.
 *   - Swipe-to-close is the donor's universal handler
 *     (`modal-overlay-sync.js:107–140`) — but a touch inside the scroller is
 *     never a drag. The donor blocks `.settings-scroll`, so a list that
 *     scrolls does not fight the swipe; the drag lives on the handle, the
 *     title and the backdrop.
 *   - One blur per stack: the card is glass, the groups inside are solid.
 */
import { el } from '../core/dom.js'

const CLOSE_MS = 300                              // nav.js closeSettings — scale(0), then the node goes
const SWIPE_CLOSE_DISTANCE = 80                   // modal-overlay-sync.js:132
const SWIPE_START = 8                             // modal-overlay-sync.js:127 (B-138)
const SWIPE_SETTLE_MS = 250                       // modal-overlay-sync.js:135
const SWIPE_TRANSITION = 'transform 0.25s ease'   // modal-overlay-sync.js:130
// modal-overlay-sync.js:117 — `.settings-scroll` is `.modal-scroll` here; the
// drum classes do not exist in this app.
const NO_DRAG_FROM = '.modal-scroll, input, textarea, select'

export interface CardModalOptions {
  id: string
  /** The card's inner HTML: handle, title, scroller — the caller's markup. */
  body: string
  onClose?: () => void
}

export interface CardModalHandle {
  root: HTMLElement
  card: HTMLElement
  close: () => void
}

export function openCardModal(opts: CardModalOptions): CardModalHandle {
  closeCardModal(opts.id)

  const dim = el('div', { class: 'modal-dim', id: `${opts.id}-dim` })
  const root = el('div', { class: 'modal-root', id: opts.id, role: 'dialog', 'aria-modal': 'true' })
  root.innerHTML = `<div class="modal-card" id="${opts.id}-card">${opts.body}</div>`
  document.body.appendChild(dim)
  document.body.appendChild(root)

  const card = root.querySelector<HTMLElement>('.modal-card')
  if (!card) throw new Error('modal markup missing')

  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    // calendar-pattern: scale(0) + opacity 0, then 300ms later it is gone.
    card.classList.remove('open')
    setTimeout(() => { root.remove(); dim.remove(); opts.onClose?.() }, CLOSE_MS)
  }

  // calendar-pattern: the node exists, then one frame later scale(1).
  requestAnimationFrame(() => card.classList.add('open'))

  // Tap on the backdrop — the donor's `if (event.target === this)`.
  root.addEventListener('click', (e) => { if (e.target === root) close() })
  attachSwipeClose(root, card, close)

  return { root, card, close }
}

/** modal-overlay-sync.js `_setupSwipeClose`, as it is. */
function attachSwipeClose(root: HTMLElement, card: HTMLElement, close: () => void): void {
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
    if (dy > SWIPE_START && dy > dx) card.style.transform = `translateY(${dy}px)`
  }, { passive: true })

  root.addEventListener('touchend', () => {
    if (blocked) { blocked = false; return }
    card.style.transition = SWIPE_TRANSITION
    if (dy > SWIPE_CLOSE_DISTANCE) {
      card.style.transform = 'translateY(100%)'
      // The donor clears the transform and clicks the root, which closes it.
      setTimeout(() => { card.style.transform = ''; close() }, SWIPE_SETTLE_MS)
    } else {
      card.style.transform = ''
    }
    dy = 0
  }, { passive: true })
}

export function closeCardModal(id: string): void {
  document.getElementById(id)?.remove()
  document.getElementById(`${id}-dim`)?.remove()
}
