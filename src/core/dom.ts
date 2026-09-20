/** Tiny DOM helpers. No framework: the app is small and the shell is fixed. */

export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel)
}

export function $$<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(sel))
}

/**
 * Escapes text before it goes into innerHTML.
 *
 * Every string that reaches the DOM through a template goes through here.
 * Quotes are escaped too, because plenty of these land inside attributes.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  html = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (html) node.innerHTML = html
  return node
}

/** "12 хв тому" / "3 год тому" / "" while still fresh. */
export function relativeTime(ts: number, freshMs = 10 * 60 * 1000): string {
  const age = Date.now() - ts
  if (age < freshMs) return ''
  const min = Math.floor(age / 60000)
  if (min < 60) return `${min} хв тому`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} год тому`
  return `${Math.floor(hours / 24)} дн тому`
}
