/**
 * Event delegation — ported from NeverMind's `src/core/delegation.js`.
 *
 * One listener on the body looks for the nearest `data-action` ancestor and
 * calls the handler registered under that name. No inline `onclick` anywhere,
 * which keeps a strict `script-src 'self'` CSP possible and makes ids safe to
 * pass as plain strings instead of interpolating them into code.
 *
 *   HTML: <button data-action="open-project" data-id="018f…">…</button>
 *   TS:   reg('open-project', (data) => openProject(data.id!))
 */
export type ActionHandler = (data: DOMStringMap, el: HTMLElement, ev: Event) => void

const ACTIONS: Record<string, ActionHandler> = Object.create(null)
let initialized = false

export function reg(name: string, fn: ActionHandler): void {
  if (!name || typeof fn !== 'function') return
  ACTIONS[name] = fn
}

/**
 * Idempotent on purpose: an iOS bfcache restore can run boot twice, and a
 * second listener would fire every action a second time.
 */
export function initDelegation(): void {
  if (initialized || typeof document === 'undefined') return
  document.body.addEventListener('click', handleClick)
  document.body.addEventListener('keydown', handleEnter)
  document.body.addEventListener('focusout', handleBlur)
  initialized = true
}

function handleClick(ev: Event): void {
  const target = ev.target as Element | null
  const host = target?.closest<HTMLElement>('[data-action]')
  if (!host) return
  const fn = ACTIONS[host.dataset.action ?? '']
  if (!fn) return // unregistered action is a silent no-op, not a crash
  fn(host.dataset, host, ev)
}

/** `data-on-enter` on an input/textarea fires an action; Shift+Enter stays a newline. */
function handleEnter(ev: KeyboardEvent): void {
  if (ev.key !== 'Enter' || ev.shiftKey) return
  const t = ev.target as HTMLElement | null
  if (!t || !(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return
  const name = t.dataset.onEnter
  if (!name) return
  const fn = ACTIONS[name]
  if (!fn) return
  ev.preventDefault()
  fn(t.dataset, t, ev)
}

/** `data-on-blur` on a field fires an action when it loses focus — the donor's save-on-blur. */
function handleBlur(ev: FocusEvent): void {
  const t = ev.target as HTMLElement | null
  if (!t || !(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return
  const name = t.dataset.onBlur
  if (!name) return
  const fn = ACTIONS[name]
  if (!fn) return
  fn(t.dataset, t, ev)
}
