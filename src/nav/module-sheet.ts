/**
 * The modules sheet — NeverMind's tab selector (`src/core/nav.js:200–413`),
 * ported. Our own here: the palette, the icons and the labels.
 *
 * The mechanics are the donor's, including the two that look like choices:
 *
 *   - Switching a module ON puts it where the registry has it, not at the end
 *     (`toggleTabSelection`: the push, then the sort by config order). The
 *     sort runs over the whole pending list, so an order made by hand in the
 *     same sitting is reset by the next switch-on. As in the donor.
 *   - Nothing moves in front of the home module (`moveTabOrder`, `newIdx < 1`);
 *     the ‹ next to the second chip is greyed out for the same reason.
 *   - A toggle repaints only the card it touched and the order strip, never
 *     the grid — so the sheet does not jump under the finger.
 *   - The ‹ › arrows exist only next to the chip you tapped (`renderTabOrderList`).
 *   - «Готово» lives in the head, closes the sheet at once and rebuilds the drum.
 *
 * Switching a module off removes it from the bar and nothing else: its data
 * stays, its screen stays registered, and switching it back on restores it
 * exactly as it was. Control has no checkbox at all — it is the home screen,
 * so "завжди" is stated rather than enforced by a disabled control nobody
 * understands.
 */
import { escapeHtml } from '../core/dom.js'
import { reg } from '../core/delegation.js'
import { openSheet, closeSheet } from '../ui/sheet.js'
import { allModules, getModule, HOME_MODULE_ID, type ModuleDef } from '../modules/registry.js'
import { getEnabledModuleIds, moveModule, saveEnabledModuleIds } from './module-state.js'

const SHEET_ID = 'modules-sheet'

// The donor's own glyphs (nav.js:225, 371, 376): the check and the ‹ › arrows.
// Only the arrow ink changed colour: #1e1040 → #202326.
const CHECK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>'
const ARROW_L = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#202326" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>'
const ARROW_R = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#202326" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'

/** The choice being made; null until the first touch, like the donor's `_pendingTabs`. */
let pending: string[] | null = null
/** The chip whose ‹ › are showing, like the donor's `_selectedOrderTab`. */
let orderPick: string | null = null
let onApply: (ids: string[]) => void = () => {}

export function openModuleSheet(apply: (ids: string[]) => void): void {
  pending = null
  orderPick = null
  onApply = apply
  const active = getEnabledModuleIds()

  openSheet({
    id: SHEET_ID,
    title: 'Модулі',
    subtitle: 'Що показувати в нижній панелі',
    action: '<button class="sheet-action" data-action="apply-modules">Готово</button>',
    body: `
      <div class="mod-grid">${allModules().map((m) => card(m, active.includes(m.id))).join('')}</div>
      <div class="mod-order-wrap">
        <div class="mod-order-label">Порядок</div>
        <div class="mod-order" id="mod-order-list"></div>
        <div class="mod-order-hint">Тапни модуль → ‹ › для переміщення</div>
      </div>`,
    onClose: () => { pending = null; orderPick = null },
  })
  renderOrderList()
}

function pendingIds(): string[] {
  if (!pending) pending = [...getEnabledModuleIds()]
  return pending
}

// applyTabSelection (nav.js:325–330)
reg('apply-modules', () => {
  const ids = pending ?? getEnabledModuleIds()
  pending = null
  const saved = saveEnabledModuleIds(ids)
  closeSheet(SHEET_ID)
  onApply(saved)
})

// toggleTabSelection (nav.js:279–323)
reg('toggle-module', (data) => {
  const id = data.id
  if (!id || !getModule(id)?.canHide) return
  const ids = pendingIds()
  const at = ids.indexOf(id)
  if (at !== -1) {
    ids.splice(at, 1)
  } else {
    const order = allModules().map((m) => m.id)
    ids.push(id)
    ids.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  }

  const on = ids.includes(id)
  const el = document.getElementById(`mod-card-${id}`)
  if (el) {
    el.classList.toggle('on', on)
    el.setAttribute('aria-pressed', String(on))
    const check = el.querySelector('.mod-card-check')
    if (check) check.innerHTML = on ? CHECK : ''
  }
  renderOrderList()
})

// selectTabOrder (nav.js:383–390): a second tap on the same chip puts the arrows away.
reg('pick-order', (data) => {
  const id = data.id ?? null
  orderPick = orderPick === id ? null : id
  renderOrderList()
})

// moveTabOrder (nav.js:392–401)
reg('move-order', (data) => {
  const id = data.id
  const dir = data.dir === '1' ? 1 : data.dir === '-1' ? -1 : 0
  if (!id || !dir) return
  pending = moveModule(pendingIds(), id, dir)
  renderOrderList()
})

// The tab card (nav.js:212–229): icon, one line of text, the check or the
// badge. A <button>, not the donor's <div>, so it is reachable from a keyboard;
// the geometry is the same. No second line: with one, three rows of cards
// outgrow the 85vh cap in Safari's 664px viewport and the body starts to
// scroll under the swipe.
function card(m: ModuleDef, on: boolean): string {
  const id = escapeHtml(m.id)
  const mark = m.canHide
    ? `<span class="mod-card-check">${on ? CHECK : ''}</span>`
    : '<span class="mod-card-locked">ЗАВЖДИ</span>'
  return `<button class="mod-card${on ? ' on' : ''}" id="mod-card-${id}" data-id="${id}"${m.canHide ? ' data-action="toggle-module"' : ''} aria-pressed="${on}">
    <span class="mod-card-ico">${m.icon}</span>
    <span class="mod-card-name">${escapeHtml(m.title)}</span>
    ${mark}
  </button>`
}

// renderTabOrderList (nav.js:340–381)
function renderOrderList(): void {
  const list = document.getElementById('mod-order-list')
  if (!list) return
  const ids = pending ?? getEnabledModuleIds()
  list.innerHTML = ids.map((rawId, idx) => {
    const mod = getModule(rawId)
    if (!mod) return ''
    const id = escapeHtml(rawId)
    const dot = '<span class="mod-order-dot"></span>'
    const name = `<span class="mod-order-name">${escapeHtml(mod.label)}</span>`
    if (rawId === HOME_MODULE_ID) {
      return `<div class="mod-order-item locked">${dot}${name}<span class="mod-order-first">перший</span></div>`
    }
    if (orderPick === rawId) {
      return `<div class="mod-order-group">
        <button class="mod-order-move" data-action="move-order" data-id="${id}" data-dir="-1"${idx <= 1 ? ' disabled' : ''}>${ARROW_L}</button>
        <div class="mod-order-item sel" data-action="pick-order" data-id="${id}">${dot}${name}</div>
        <button class="mod-order-move" data-action="move-order" data-id="${id}" data-dir="1"${idx >= ids.length - 1 ? ' disabled' : ''}>${ARROW_R}</button>
      </div>`
    }
    return `<div class="mod-order-item" data-action="pick-order" data-id="${id}">${dot}${name}</div>`
  }).join('')
}
