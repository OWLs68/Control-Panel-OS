/**
 * The Crow zone.
 *
 * One character, one bubble, one chip strip, for the whole app — the same agent
 * with the same voice, saying something relevant to wherever you are.
 *
 * Behaviour is NeverMind's board (`src/owl/board.js`): the avatar stands
 * beside the bubble at the bubble's height; the chips run under both and stay
 * put when the board is collapsed (`_owlTabApplyState` keeps `chipsWrap`
 * visible in both states); a swipe up collapses (`owlTabSwipeEnd`, dy < -40);
 * a swipe down on the open board opens the chat; a tap on the strip brings
 * the board back; priority colours the bubble; the text cross-fades instead
 * of snapping; a message that has gone stale says how old it is.
 *
 * What the donor does not have: the collapse follows the finger. Its board
 * swaps display:none on touchend, which passes there because the board is a
 * thin strip inside the page. Ours is fixed, three times taller and has a
 * person in it, and a jump cut read as a glitch (ISS-007). So the row's height
 * tracks the drag, the strip fades in underneath, and on release it snaps to
 * whichever side the donor's 40px threshold says.
 *
 * The geometry — figure at bubble height, chips under both — is Roman's
 * decision of 20.09 and replaces the full-height figure of HANDOFF §3.5.
 */
import { $, relativeTime } from '../core/dom.js'
import { reg } from '../core/delegation.js'
import { icons } from '../ui/icons.js'
import { CrowCharacter } from './character.js'
import { renderChips, updateChipArrows, type ChipHandlers } from './chips.js'
import type { CrowChip } from '../hermes/contract.js'

export type ZoneState = 'expanded' | 'collapsed'

export interface BoardMessage {
  title: string
  text: string
  priority: 'normal' | 'urgent' | 'success'
  chips: CrowChip[]
  ts: number
}

const FADE_MS = 200
const STALE_AFTER = 10 * 60 * 1000
const COLLAPSE_AT = 40          // owl/board.js:80 — the swipe that commits, in px
const DRAG_START = 6            // px before a touch counts as a drag rather than a tap
const STRIP_H = 52              // .crow-collapsed
const SETTLE_MS = 300
const SETTLE = 'height 0.28s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease'

let zone: HTMLElement | null = null
let row: HTMLElement | null = null
let strip: HTMLElement | null = null
let character: CrowCharacter | null = null
let state: ZoneState = 'expanded'
let current: BoardMessage | null = null
let handlers: ChipHandlers = { onChat: () => {}, onNav: () => {}, onOpen: () => {} }

export function setupCrowZone(root: HTMLElement, chipHandlers: ChipHandlers): void {
  zone = root
  handlers = chipHandlers
  // Upright: the 10° lean read as crooked on the phone (Roman, 20.09).
  character = new CrowCharacter({ pose: 'front', tilt: 0 })

  root.dataset.state = 'expanded'
  root.innerHTML = `
    <div class="crow-expanded" id="crow-row">
      <div class="crow-figure-slot"></div>
      <div class="crow-bubble" id="crow-bubble" data-priority="normal">
        <div class="crow-bubble-head">
          <span class="crow-bubble-title" id="crow-title"></span>
          <span class="crow-bubble-meta">${icons.sun}<span id="crow-date"></span></span>
        </div>
        <div class="crow-bubble-text" id="crow-text"></div>
        <div class="crow-bubble-time" id="crow-time"></div>
      </div>
    </div>
    <button class="crow-collapsed" id="crow-strip" data-action="expand-crow" aria-label="Розгорнути Crow">
      <span class="crow-collapsed-figure"></span>
      <span class="crow-collapsed-text" id="crow-collapsed-text"></span>
      <span class="crow-collapsed-caret">${icons.chevronDown}</span>
    </button>
    <div class="chips-wrap">
      <button class="chips-arrow chips-arrow-left" id="chips-left" data-action="scroll-chips" data-dir="-1" aria-label="Лівіше">‹</button>
      <div class="chips" id="crow-chips"></div>
      <button class="chips-arrow chips-arrow-right" id="chips-right" data-action="scroll-chips" data-dir="1" aria-label="Правіше">›</button>
    </div>`

  $('.crow-figure-slot', root)?.replaceWith(character.node)
  $('.crow-collapsed-figure', root)?.replaceWith(CrowCharacter.miniature())

  row = $('#crow-row', root)
  strip = $('#crow-strip', root)

  // The figure is exactly as tall as the bubble, whatever the bubble says.
  const bubble = $('#crow-bubble', root)
  if (bubble) {
    const fit = () => character?.fitTo(bubble.offsetHeight)
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(bubble)
    fit()
  }

  const chips = $('#crow-chips', root)
  const left = $('#chips-left', root)
  const right = $('#chips-right', root)
  if (chips && left && right) {
    chips.addEventListener('scroll', () => updateChipArrows(chips, left, right), { passive: true })
  }

  attachCollapseDrag()

  reg('expand-crow', () => setZoneState('expanded'))
  reg('scroll-chips', (data) => {
    const el = $('#crow-chips')
    if (!el) return
    el.scrollBy({ left: (data.dir === '1' ? 1 : -1) * 130, behavior: 'smooth' })
  })

  const today = new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
  const date = $('#crow-date', root)
  if (date) date.textContent = today
}

/* ── Collapse: follows the finger, snaps on release ──────────────────── */

let fullHeight = 0
let animating = false

/** p = 1 is the open board, p = 0 the strip; everything between is the drag. */
function apply(p: number): void {
  if (!row || !strip) return
  row.style.height = `${fullHeight * p}px`
  row.style.opacity = String(p)
  row.style.visibility = 'visible'
  strip.style.height = `${STRIP_H * (1 - p)}px`
  strip.style.opacity = String(1 - p)
  strip.style.visibility = 'visible'
}

/** Pin the current geometry in pixels so it can be moved. */
function pin(): void {
  if (!row || !strip) return
  // The bubble sets the row's natural height (the figure is fitted to it), and
  // it is never stretched by the row — so this is right even while the row
  // sits at 0, and a pinned row never feeds back into the figure's size.
  fullHeight = $('#crow-bubble', zone ?? document)?.offsetHeight ?? row.scrollHeight
  document.body.classList.add('crow-dragging')   // the screens follow every frame, no easing
  row.classList.add('is-moving')                 // clip only while moving; at rest nothing is cropped
  row.style.transition = 'none'
  strip.style.transition = 'none'
  apply(state === 'expanded' ? 1 : 0)
}

function settle(next: ZoneState): void {
  if (!row || !strip) return
  animating = true
  document.body.classList.remove('crow-dragging')
  row.style.transition = SETTLE
  strip.style.transition = SETTLE
  void row.offsetHeight   // let the pinned height land before the target does, or it snaps
  apply(next === 'expanded' ? 1 : 0)
  window.setTimeout(() => finish(next), SETTLE_MS)
}

function finish(next: ZoneState): void {
  animating = false
  state = next
  if (zone) zone.dataset.state = next
  // Back to the stylesheet: the open row sizes to its content again.
  row?.classList.remove('is-moving')
  for (const el of [row, strip]) {
    if (!el) continue
    el.style.height = ''
    el.style.opacity = ''
    el.style.visibility = ''
    el.style.transition = ''
  }
}

function attachCollapseDrag(): void {
  if (!zone) return
  let startY = 0
  let startX = 0
  let dy = 0
  let armed = false     // a touch began on the board or the strip
  let dragging = false  // ...and has moved far enough to be a drag, not a tap

  // The board and the strip drag; the chip strip scrolls sideways instead.
  const fromBoard = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('.crow-expanded, .crow-collapsed')

  zone.addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    armed = !!t && !animating && fromBoard(e.target)
    dragging = false
    if (!armed || !t) return
    startY = t.clientY
    startX = t.clientX
    dy = 0
  }, { passive: true })

  zone.addEventListener('touchmove', (e) => {
    if (!armed) return
    const t = e.touches[0]
    if (!t) return
    dy = t.clientY - startY
    if (Math.abs(t.clientX - startX) > Math.abs(dy)) return   // sideways is not ours
    // A tap stays a tap: the geometry is pinned only once the finger really
    // moves, so the strip's own click (expand) is never swallowed by a settle.
    if (!dragging) {
      if (Math.abs(dy) < DRAG_START) return
      dragging = true
      pin()
    }
    const p = state === 'expanded' ? 1 + dy / fullHeight : dy / fullHeight
    apply(Math.min(1, Math.max(0, p)))
  }, { passive: true })

  zone.addEventListener('touchend', () => {
    if (!armed) return
    armed = false
    if (!dragging) return
    dragging = false
    if (state === 'expanded') {
      if (dy < -COLLAPSE_AT) { settle('collapsed'); return }
      settle('expanded')
      // owl/board.js:85 — a swipe down on the open board opens the chat.
      if (dy > COLLAPSE_AT) handlers.onSpeak?.()
    } else {
      settle(dy > COLLAPSE_AT ? 'expanded' : 'collapsed')
    }
  }, { passive: true })

  zone.addEventListener('touchcancel', () => {
    if (!armed) return
    armed = false
    if (dragging) { dragging = false; settle(state) }
  }, { passive: true })
}

export function setZoneState(next: ZoneState): void {
  if (!zone || !row || !strip || state === next || animating) return
  pin()
  requestAnimationFrame(() => settle(next))
}

/* ── The message ─────────────────────────────────────────────────────── */

export function showMessage(msg: BoardMessage): void {
  if (!zone) return
  current = msg

  const bubble = $('#crow-bubble', zone)
  const title = $('#crow-title', zone)
  const text = $('#crow-text', zone)
  const collapsed = $('#crow-collapsed-text', zone)
  if (bubble) bubble.dataset.priority = msg.priority
  if (title) title.textContent = msg.title
  if (collapsed) collapsed.textContent = msg.text.replace(/\n+/g, ' ')

  // Cross-fade rather than a hard swap: the first message appears instantly,
  // later ones fade so the zone does not blink on every module change.
  if (text) {
    if (!text.textContent) {
      text.textContent = msg.text
    } else if (text.textContent !== msg.text) {
      text.classList.add('is-fading')
      setTimeout(() => {
        text.textContent = msg.text
        text.classList.remove('is-fading')
      }, FADE_MS)
    }
  }

  character?.sayOnce()
  renderBoardChips(msg.chips)
  refreshAge()
}

export function setChips(chips: CrowChip[]): void {
  if (current) current.chips = chips
  renderBoardChips(chips)
}

function renderBoardChips(chips: CrowChip[]): void {
  const strip = $('#crow-chips')
  const left = $('#chips-left')
  const right = $('#chips-right')
  if (!strip) return
  renderChips(strip, chips, handlers, { speak: true })
  if (left && right) setTimeout(() => updateChipArrows(strip, left, right), 50)
}

/**
 * A stale thought says so instead of being hidden.
 *
 * NeverMind's lesson: collapsing the board when a message ages makes the UI
 * jump; a grey "12 хв тому" under it tells the truth and moves nothing.
 */
export function refreshAge(): void {
  const time = $('#crow-time')
  if (!time || !current) return
  const label = relativeTime(current.ts, STALE_AFTER)
  time.textContent = label ? `• ${label}` : ''
}

export function crowSpeaking(on: boolean): void {
  if (on) character?.startTalking()
  else character?.stopTalking()
}
