/**
 * The row of a card modal — NeverMind's .s-row (index.html:1266–1279): an
 * icon, a title, a subtitle, something on the right (a chevron, a value, a
 * switch, a tick). Moved out of settings.ts so every card modal draws the same
 * measured row (52px, PORTING.md §2): «Налаштування» and the task card.
 */
import { escapeHtml } from '../core/dom.js'

export interface ModalRowSpec {
  action?: string
  id?: string
  icon: string
  tone: 'amber' | 'ink'
  title: string
  sub?: string
  right?: string
  disabled?: boolean
  /** For a switch row: aria-checked. */
  checked?: boolean
  /** For one choice among several: aria-pressed. */
  pressed?: boolean
  /** data-* attributes for the action handler. */
  data?: Record<string, string>
}

export function modalRow(r: ModalRowSpec): string {
  const inner = `
    <div class="s-row-left">
      <div class="s-icon s-icon-${r.tone}">${r.icon}</div>
      <div class="s-row-text">
        <div class="s-row-title">${escapeHtml(r.title)}</div>
        ${r.sub ? `<div class="s-row-sub">${escapeHtml(r.sub)}</div>` : ''}
      </div>
    </div>
    ${r.right ?? ''}`
  const id = r.id ? ` id="${r.id}"` : ''
  if (!r.action) return `<div class="s-row s-row-static"${id}>${inner}</div>`
  const role = r.checked === undefined ? '' : ` role="switch" aria-checked="${r.checked}"`
  const pressed = r.pressed === undefined ? '' : ` aria-pressed="${r.pressed}"`
  const data = Object.entries(r.data ?? {}).map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`).join('')
  return `<button type="button" class="s-row"${id} data-action="${r.action}"${data}${role}${pressed}${r.disabled ? ' disabled' : ''}>${inner}</button>`
}

/** The donor's switch (style.css:553–571), amber when on. */
export function modalToggle(on: boolean): string {
  return `<span class="s-toggle${on ? ' on' : ''}"><span class="s-toggle-thumb"></span></span>`
}
