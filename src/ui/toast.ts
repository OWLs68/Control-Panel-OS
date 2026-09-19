import { el } from '../core/dom.js'

/** Brief confirmation, bottom-centre, above the dock. Never blocks input. */
export function showToast(message: string, duration = 2200): void {
  const host = document.getElementById('toast-host')
  if (!host) return
  const node = el('div', { class: 'toast', role: 'status' })
  node.textContent = message
  host.appendChild(node)
  setTimeout(() => {
    node.classList.add('is-leaving')
    setTimeout(() => node.remove(), 200)
  }, duration)
}
