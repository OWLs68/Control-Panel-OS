/**
 * Bottom sheet.
 *
 * Follows NeverMind's modal contract, including the parts that only matter on
 * an iPhone:
 *
 *   - The dim layer is a TOP-LEVEL SIBLING, never a child of the sheet. As a
 *     child, its blur gets clipped to the card's composite region the moment
 *     the card is dragged, and the whole thing appears to shrink.
 *   - Three ways out: tap the backdrop, drag the backdrop down, drag the card
 *     down. All three, every time — a sheet with only one is a trap.
 *   - The card follows the finger. A sheet that sits still while you pull it
 *     reads as broken even when the tap-to-close works.
 *   - Padding lives on the outer panel, which owns overflow:hidden — not on the
 *     scroller, where it once reduced the visible content to nothing.
 *   - `overscroll-behavior: none`, never `contain`: contain still lets the
 *     container itself bounce, which looks like the sheet is squashing.
 */
import { el } from '../core/dom.js'

const CLOSE_DISTANCE = 80    // px of drag that commits to closing
const DRAG_START = 6         // px before a touch counts as a drag at all

export interface SheetOptions {
  id: string
  title: string
  subtitle?: string
  body: string
  footer?: string
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
  root.innerHTML = `
    <div class="sheet" id="${opts.id}-card">
      <div class="sheet-grab" aria-hidden="true"></div>
      <div class="sheet-head">
        <div class="sheet-title">${opts.title}</div>
        ${opts.subtitle ? `<div class="sheet-sub">${opts.subtitle}</div>` : ''}
      </div>
      <div class="sheet-body" id="${opts.id}-body">${opts.body}</div>
      ${opts.footer ? `<div class="sheet-foot">${opts.footer}</div>` : ''}
    </div>`

  document.body.appendChild(overlay)
  document.body.appendChild(root)

  const card = root.querySelector<HTMLElement>('.sheet')
  const grab = root.querySelector<HTMLElement>('.sheet-grab')
  const body = root.querySelector<HTMLElement>('.sheet-body')
  if (!card || !body) throw new Error('sheet markup missing')

  const close = () => {
    card.style.transition = 'transform var(--motion-normal) var(--ease-spring)'
    card.classList.remove('open')
    card.style.transform = 'translateY(100%)'
    overlay.classList.remove('open')
    setTimeout(() => {
      root.remove()
      overlay.remove()
      opts.onClose?.()
    }, 280)
  }

  // Two frames: one for the node to exist, one for the browser to accept the
  // starting transform before the transition runs. One frame and it snaps.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add('open')
    overlay.classList.add('open')
    card.classList.add('open')
  }))

  // Way 1 — tap the backdrop. The guard keeps a tap inside the card from
  // bubbling up and closing the sheet under the finger.
  root.addEventListener('click', (e) => { if (e.target === root) close() })

  // Ways 2 and 3 — drag, from the backdrop or from the card's own handle.
  attachDrag(root, card, close)
  if (grab) attachDrag(grab, card, close)

  return { root, body, close }
}

function attachDrag(surface: HTMLElement, card: HTMLElement, close: () => void): void {
  let startY = 0
  let dragging = false

  surface.addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    if (!t) return
    startY = t.clientY
    dragging = false
    card.style.transition = 'none'
  }, { passive: true })

  surface.addEventListener('touchmove', (e) => {
    const t = e.touches[0]
    if (!t) return
    const dy = t.clientY - startY
    if (dy > DRAG_START) {
      dragging = true
      card.style.transform = `translateY(${dy}px)`
    }
  }, { passive: true })

  surface.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]
    if (!t) return
    const dy = t.clientY - startY
    card.style.transition = 'transform var(--motion-normal) var(--ease-spring)'
    if (dragging && dy > CLOSE_DISTANCE) close()
    else card.style.transform = 'translateY(0)'
    dragging = false
  }, { passive: true })

  surface.addEventListener('touchcancel', () => {
    card.style.transition = 'transform var(--motion-normal) var(--ease-spring)'
    card.style.transform = 'translateY(0)'
    dragging = false
  }, { passive: true })
}

export function closeSheet(id: string): void {
  document.getElementById(id)?.remove()
  document.getElementById(`${id}-overlay`)?.remove()
}
