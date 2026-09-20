/**
 * The drum.
 *
 * Ported from NeverMind's `setupDrumTabbar` / `applyDrum3D`, numbers included —
 * they are not decoration. The weighted velocity keeps a flick from reading as
 * a jitter, 0.88 friction is what makes it coast for about the right distance,
 * the rubber 0.25 at the ends says "there is nothing further" without a bounce,
 * and the arc is computed from each item's real position so it stays live while
 * the finger is still down.
 *
 * A horizontal scroller with scroll-snap looks similar in a screenshot and
 * feels wrong in the hand, which is exactly the trap this file exists to avoid.
 */
import { $, escapeHtml } from '../core/dom.js'
import { getModule } from '../modules/registry.js'
import { getEnabledModuleIds } from './module-state.js'

const DRUM_RADIUS = 190      // px — smaller means a more curved disc
const PERSPECTIVE = 500
const FRICTION = 0.88
const MIN_VELOCITY = 0.5     // px/frame — below this the coast is over
const RUBBER = 0.25          // how much of an over-drag survives at the ends
const TAP_SLOP = 8           // px of movement still counted as a tap

let capsule: HTMLElement | null = null
let track: HTMLElement | null = null
let onPick: (id: string) => void = () => {}

let tx = 0
let startX = 0
let startTX = 0
let dragging = false
let velocity = 0
let lastX = 0
let lastTime = 0
let rafId: number | null = null
let suppressReposition = false

export function setupDrum(container: HTMLElement, pick: (id: string) => void): void {
  onPick = pick
  // NeverMind index.html:816-825 — a capsule holding the track, and a separate
  // square button beside it. Only the button's icon is ours.
  container.innerHTML = `
    <div class="drum-capsule" id="drum-capsule">
      <div class="drum-track" id="drum-track"></div>
    </div>
    <div class="drum-plus-btn" data-action="open-modules" role="button" tabindex="0" aria-label="Модулі">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>
    </div>`

  capsule = $('#drum-capsule', container)
  track = $('#drum-track', container)
  if (!capsule || !track) return

  attachGestures(capsule)

  // The capsule's width is not final at first layout — the bar settles once the
  // safe-area insets resolve and again when the web fonts land, and padding
  // computed against the old width leaves the active tab off centre with
  // nothing to correct it.
  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = 0
    new ResizeObserver(() => {
      const width = capsule?.offsetWidth ?? 0
      if (!width || Math.abs(width - lastWidth) < 1) return
      lastWidth = width
      applyPadding(getCurrentId(), true)
    }).observe(capsule)
  } else {
    window.addEventListener('resize', () => requestAnimationFrame(() => applyPadding(getCurrentId(), true)))
  }
}

let currentId = 'control'
const getCurrentId = () => currentId

export function rebuildDrum(activeId: string): void {
  if (!track || !capsule) return
  currentId = activeId
  const ids = getEnabledModuleIds()

  // nav.js:353 — a div per tab, icon over label. Not a <button>: the donor's
  // global press-scale must not fire on a drum cell.
  track.innerHTML = ids.map((id) => {
    const mod = getModule(id)
    if (!mod) return ''
    return `<div class="tab-item${id === activeId ? ' active' : ''}" data-tab="${escapeHtml(id)}" role="button" tabindex="0">
      <span class="tab-icon">${mod.icon}</span>
      <span class="tab-label">${escapeHtml(mod.label)}</span>
    </div>`
  }).join('')

  requestAnimationFrame(() => applyPadding(activeId, true))
}

function applyPadding(activeId: string, skipAnimation = false): void {
  if (!track || !capsule) return
  // Kill any transition FIRST. Resetting the transform while one is still
  // running means the next getBoundingClientRect reads a mid-animation
  // position, and the drum settles off centre.
  track.style.transition = 'none'

  // nav.js:441 — a full half-capsule on each side, so the first and last tab
  // can still reach the middle. The centring itself is done by snapXFor.
  const half = Math.floor(capsule.offsetWidth / 2)
  if (half > 0) {
    track.style.paddingLeft = `${half}px`
    track.style.paddingRight = `${half}px`
  }
  setTX(0)
  void track.offsetWidth   // force the reset to land before anything is measured
  centreOn(activeId, skipAnimation)
}

export function updateDrum(activeId: string, skipAnimation = false): void {
  if (suppressReposition) return
  currentId = activeId
  centreOn(activeId, skipAnimation)
}

function items(): HTMLElement[] {
  return track ? Array.from(track.querySelectorAll<HTMLElement>('.tab-item[data-tab]')) : []
}

function setTX(x: number): void {
  if (!track) return
  tx = x
  track.style.transform = `translateX(${x}px)`
}

/** How far to move so `item` lands dead centre. Cancels out the current tx. */
function snapXFor(item: HTMLElement): number {
  if (!capsule) return tx
  const cc = capsule.getBoundingClientRect()
  const ic = item.getBoundingClientRect()
  return tx + (cc.left + cc.width / 2) - (ic.left + ic.width / 2)
}

function bounds(): { minX: number; maxX: number } {
  const list = items()
  const first = list[0]
  const last = list[list.length - 1]
  if (!first || !last) return { minX: tx, maxX: tx }
  return { maxX: snapXFor(first), minX: snapXFor(last) }
}

function itemAtCentre(): HTMLElement | null {
  if (!capsule) return null
  const centre = capsule.getBoundingClientRect().left + capsule.offsetWidth / 2
  let best: HTMLElement | null = null
  let bestDistance = Infinity
  for (const item of items()) {
    const r = item.getBoundingClientRect()
    const d = Math.abs(r.left + r.width / 2 - centre)
    if (d < bestDistance) { bestDistance = d; best = item }
  }
  return best
}

/** Rotates each item along an arc based on where it actually is right now. */
function applyDrum3D(): void {
  if (!capsule) return
  const cc = capsule.getBoundingClientRect()
  const centre = cc.left + cc.width / 2
  for (const item of items()) {
    const r = item.getBoundingClientRect()
    const offset = r.left + r.width / 2 - centre
    const angle = (Math.atan2(offset, DRUM_RADIUS) * 180) / Math.PI
    const scale = item.classList.contains('active') ? 1.1
      : item.classList.contains('near') ? 0.97
      : item.classList.contains('far') ? 0.93 : 0.87
    item.style.transform = `perspective(${PERSPECTIVE}px) rotateY(${angle.toFixed(1)}deg) scale(${scale})`
  }
}

function updateVisuals(centreItem: HTMLElement | null): void {
  const list = items()
  const idx = centreItem ? list.indexOf(centreItem) : -1
  list.forEach((item, i) => {
    const d = Math.abs(i - idx)
    item.classList.toggle('active', d === 0)
    item.classList.toggle('near', d === 1)
    item.classList.toggle('far', d === 2)
  })
  applyDrum3D()
}

function centreOn(id: string, skipAnimation: boolean): void {
  if (!track) return
  const item = items().find((n) => n.dataset.tab === id)
  if (!item) return
  const x = snapXFor(item)
  if (skipAnimation) {
    track.style.transition = 'none'
    setTX(x)
    requestAnimationFrame(() => {
      updateVisuals(item)
      if (track) track.style.transition = ''
    })
    return
  }
  animateTo(x, item)
}

function animateTo(x: number, item: HTMLElement): void {
  if (!track) return
  track.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)'
  setTX(x)
  // The CSS transition moves the track, but the arc has to be recomputed every
  // frame while it does — otherwise the tabs rotate only at the endpoints.
  const until = Date.now() + 320
  const tick = () => {
    updateVisuals(item)
    if (Date.now() < until) requestAnimationFrame(tick)
    else if (track) track.style.transition = ''
  }
  requestAnimationFrame(tick)
}

function snapToItem(item: HTMLElement): void {
  animateTo(snapXFor(item), item)
  const id = item.dataset.tab
  if (id && id !== currentId) {
    currentId = id
    suppressReposition = true
    onPick(id)
    suppressReposition = false
  }
}

function momentum(initial: number): void {
  let v = initial
  if (rafId) cancelAnimationFrame(rafId)
  const step = () => {
    v *= FRICTION
    const { minX, maxX } = bounds()
    let next = tx + v
    if (next > maxX) { next = maxX; v = 0 }
    if (next < minX) { next = minX; v = 0 }
    setTX(next)
    updateVisuals(itemAtCentre())
    if (Math.abs(v) > MIN_VELOCITY) rafId = requestAnimationFrame(step)
    else {
      rafId = null
      const item = itemAtCentre()
      if (item) snapToItem(item)
    }
  }
  rafId = requestAnimationFrame(step)
}

function attachGestures(node: HTMLElement): void {
  node.addEventListener('touchstart', (e) => {
    const touch = e.touches[0]
    if (!touch || !track) return
    node.classList.add('drum-dragging')
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    track.style.transition = 'none'
    // Read the live position out of the DOM: the track may be mid-transition,
    // and starting from a stale tx makes the drum jump under the finger.
    const matrix = new DOMMatrix(getComputedStyle(track).transform)
    tx = Number.isNaN(matrix.m41) ? tx : matrix.m41
    startTX = tx
    startX = touch.clientX
    lastX = startX
    lastTime = Date.now()
    velocity = 0
    dragging = true
  }, { passive: true })

  node.addEventListener('touchmove', (e) => {
    const touch = e.touches[0]
    if (!dragging || !touch) return
    const now = Date.now()
    const dt = now - lastTime
    // Weighted average, so one noisy sample cannot define the whole flick.
    if (dt > 0) velocity = velocity * 0.6 + ((touch.clientX - lastX) / dt) * 0.4
    lastX = touch.clientX
    lastTime = now

    const { minX, maxX } = bounds()
    let next = startTX + (touch.clientX - startX)
    if (next > maxX) next = maxX + (next - maxX) * RUBBER
    if (next < minX) next = minX + (next - minX) * RUBBER
    setTX(next)
    updateVisuals(itemAtCentre())
  }, { passive: true })

  node.addEventListener('touchend', () => {
    node.classList.remove('drum-dragging')
    if (!dragging) return
    dragging = false
    if (Math.abs(tx - startTX) < 5) return   // that was a tap; let click handle it
    const v = velocity * 16                  // px/ms → px per 60fps frame
    if (Math.abs(v) > 1) momentum(v)
    else {
      const item = itemAtCentre()
      if (item) snapToItem(item)
    }
  }, { passive: true })

  node.addEventListener('click', (e) => {
    const target = (e.target as Element | null)?.closest<HTMLElement>('.tab-item[data-tab]')
    if (!target || Math.abs(tx - startTX) > TAP_SLOP) return
    snapToItem(target)
  })
}
