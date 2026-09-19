/**
 * The modules sheet.
 *
 * Switching a module off removes it from the bar and nothing else: its data
 * stays, its screen stays registered, and switching it back on restores it
 * exactly as it was. Control has no checkbox at all — it is the home screen,
 * so "завжди" is stated rather than enforced by a disabled control nobody
 * understands.
 */
import { $, $$, escapeHtml } from '../core/dom.js'
import { reg } from '../core/delegation.js'
import { icons } from '../ui/icons.js'
import { openSheet, closeSheet } from '../ui/sheet.js'
import { allModules, getModule } from '../modules/registry.js'
import { getEnabledModuleIds, moveModule, saveEnabledModuleIds } from './module-state.js'

const SHEET_ID = 'modules-sheet'

let pending: string[] = []
let orderPick: string | null = null

export function openModuleSheet(onApply: (ids: string[]) => void): void {
  pending = getEnabledModuleIds()
  orderPick = null

  const handle = openSheet({
    id: SHEET_ID,
    title: 'Модулі',
    subtitle: 'Що показувати в нижній панелі',
    body: sheetBody(),
    footer: `<button class="btn btn-dark btn-block" data-action="apply-modules">Готово</button>`,
  })

  reg('apply-modules', () => {
    const saved = saveEnabledModuleIds(pending)
    closeSheet(SHEET_ID)
    onApply(saved)
  })

  reg('toggle-module', (data) => {
    const id = data.id
    const mod = id ? getModule(id) : undefined
    if (!id || !mod?.canHide) return
    pending = pending.includes(id) ? pending.filter((m) => m !== id) : [...pending, id]
    repaint(handle.body)
  })

  reg('pick-order', (data) => {
    orderPick = orderPick === data.id ? null : (data.id ?? null)
    repaint(handle.body)
  })

  reg('move-order', (data) => {
    if (!orderPick) return
    pending = moveModule(pending, orderPick, data.dir === '1' ? 1 : -1)
    repaint(handle.body)
  })
}

function repaint(body: HTMLElement): void {
  body.innerHTML = sheetBody()
  // Keep the body scrolled where it was; a repaint that jumps to the top makes
  // toggling the last module feel like the sheet reset itself.
  $$('.mod-card', body).forEach((c) => c.classList.toggle('on', pending.includes(c.dataset.id ?? '')))
}

function sheetBody(): string {
  const core = allModules().filter((m) => m.group === 'core')
  const personal = allModules().filter((m) => m.group === 'personal')
  return `
    <div class="section-label" style="margin-top:0">Ядро системи</div>
    <div class="mod-grid">${core.map(modCard).join('')}</div>
    ${personal.length ? `
      <div class="section-label">Особисті модулі</div>
      <div class="mod-grid">${personal.map(modCard).join('')}</div>` : ''}
    <div class="section-label">Порядок</div>
    <div class="mod-order">${pending.map(orderChip).join('')}</div>
    <div class="mod-order-move">
      <button class="btn btn-ghost" data-action="move-order" data-dir="-1" ${orderPick ? '' : 'disabled'}>‹ Лівіше</button>
      <button class="btn btn-ghost" data-action="move-order" data-dir="1" ${orderPick ? '' : 'disabled'}>Правіше ›</button>
    </div>
    <div class="sheet-sub" style="margin-top:8px">Тапни модуль у списку, потім ‹ або ›</div>
  `
}

function modCard(m: { id: string; title: string; kind: string; icon: string; canHide: boolean }): string {
  const on = pending.includes(m.id)
  const mark = m.canHide
    ? `<span class="mod-card-check">${on ? icons.check : ''}</span>`
    : `<span class="mod-card-locked">ЗАВЖДИ</span>`
  return `<button class="mod-card${on ? ' on' : ''}" data-id="${escapeHtml(m.id)}"
            ${m.canHide ? 'data-action="toggle-module"' : ''}
            aria-pressed="${on}">
    <span class="mod-card-ico">${m.icon}</span>
    <span class="mod-card-name">${escapeHtml(m.title)}</span>
    <span class="mod-card-kind">${escapeHtml(m.kind)}</span>
    ${mark}
  </button>`
}

function orderChip(id: string): string {
  const mod = getModule(id)
  if (!mod) return ''
  return `<button class="mod-order-item${orderPick === id ? ' sel' : ''}" data-action="pick-order" data-id="${escapeHtml(id)}">${escapeHtml(mod.label)}</button>`
}

export function isModuleSheetOpen(): boolean {
  return $(`#${SHEET_ID}`) !== null
}
