/**
 * Gesture detection by attribute — ported from NeverMind's `src/ui/touch-detect.js`.
 *
 * Swipe:  <div data-swipe-detect data-swipe-action="crow-zone" data-swipe-axis="y"
 *              data-swipe-threshold="40">
 * Tap:    <div data-tap-detect data-tap-action="toggle-step" data-tap-threshold="10">
 *
 * The iOS notes the donor paid for, kept verbatim:
 *   - touchstart/touchmove are passive; we never block the OS from scrolling.
 *     A blanket preventDefault in touchmove kills the chip strip's scroll.
 *   - touchend is non-passive, because a tap has to swallow the ghost click.
 *   - touchend reads `changedTouches[0]`; `touches` is empty by then.
 *   - state lives in a WeakMap per element, so two elements mid-gesture cannot
 *     overwrite each other's start coordinates.
 */
export type TouchHandler = (data: DOMStringMap, delta: number) => void

interface TouchState { sx: number; sy: number; dx: number; dy: number }

const state = new WeakMap<HTMLElement, TouchState>()
const HANDLERS: Record<string, TouchHandler> = Object.create(null)
let initialized = false

export function regTouch(name: string, fn: TouchHandler): void {
  if (!name || typeof fn !== 'function') return
  HANDLERS[name] = fn
}

export function initTouchDetect(): void {
  if (initialized || typeof document === 'undefined') return
  document.body.addEventListener('touchstart', onStart, { passive: true })
  document.body.addEventListener('touchmove', onMove, { passive: true })
  document.body.addEventListener('touchend', onEnd, { passive: false })
  initialized = true
}

function findTarget(t: EventTarget | null): HTMLElement | null {
  const node = t as Element | null
  if (!node?.closest) return null
  return node.closest<HTMLElement>('[data-swipe-detect], [data-tap-detect]')
}

function onStart(ev: TouchEvent): void {
  const host = findTarget(ev.target)
  const touch = ev.touches[0]
  if (!host || !touch) return
  state.set(host, { sx: touch.clientX, sy: touch.clientY, dx: 0, dy: 0 })
}

function onMove(ev: TouchEvent): void {
  const host = findTarget(ev.target)
  const touch = ev.touches[0]
  if (!host || !touch) return
  const s = state.get(host)
  if (!s) return
  s.dx = touch.clientX - s.sx
  s.dy = touch.clientY - s.sy
}

function onEnd(ev: TouchEvent): void {
  const host = findTarget(ev.target)
  if (!host) return
  const s = state.get(host)
  state.delete(host)
  if (!s) return

  if (host.hasAttribute('data-swipe-detect')) {
    const threshold = Number(host.dataset.swipeThreshold ?? 40)
    const axis = host.dataset.swipeAxis ?? 'y'
    const delta = axis === 'x' ? s.dx : s.dy
    const other = axis === 'x' ? s.dy : s.dx
    // A diagonal drag belongs to whichever axis dominates, not to both.
    if (Math.abs(delta) < threshold || Math.abs(other) > Math.abs(delta)) return
    HANDLERS[host.dataset.swipeAction ?? '']?.(host.dataset, delta)
    return
  }

  if (host.hasAttribute('data-tap-detect')) {
    const threshold = Number(host.dataset.tapThreshold ?? 10)
    if (Math.abs(s.dx) > threshold || Math.abs(s.dy) > threshold) return // that was a scroll
    ev.preventDefault() // no ghost click after the tap fires
    HANDLERS[host.dataset.tapAction ?? '']?.(host.dataset, 0)
  }
}
