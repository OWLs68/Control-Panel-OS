/**
 * Settings — NeverMind's panel (`index.html:1256–1567`, `nav.js:734–840`
 * `openSettings`/`closeSettings`), ported as a card modal: handle, title,
 * version line, a scroller of labelled groups, rows with an icon, a title, a
 * subtitle and a chevron, a value or a switch on the right.
 *
 * Only the rows Roma OS has a use for (Roman, 21.09) — not the donor's
 * profile, API key, currency, language or usage meter. Nothing here stores a
 * secret, and nothing here talks to a server.
 *
 * The gear in the top bar took the magnifier's place: search already opens
 * the chat, so the button was a second way to do the same thing.
 */
import { reg } from '../core/delegation.js'
import { escapeHtml } from '../core/dom.js'
import { count } from '../core/plural.js'
import { clearHistory, historyLength } from '../crow/chat.js'
import { isVoiceAvailable, isVoiceEnabled, setVoiceEnabled } from '../crow/voice.js'
import { seedFixtures } from '../data/seed.js'
import { openModules } from '../nav/shell.js'
import { openCardModal, closeCardModal, type CardModalHandle } from './card-modal.js'
import { deployLabel, hardRefresh, showDeployInfo } from './deploy-info.js'
import { icons } from './icons.js'
import { showToast } from './toast.js'

const MODAL_ID = 'settings-modal'

// The donor's chevron (index.html:1273): 14px, stroke 2.5, 0.3 alpha — and
// .s-chevron dims it again to 0.3. Both kept.
const CHEVRON = '<svg class="s-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(38,42,47,0.3)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'

let modal: CardModalHandle | null = null

export function setupSettings(): void {
  reg('open-settings', openSettings)

  reg('settings-modules', () => { close(); openModules() })

  reg('settings-voice', () => {
    if (!isVoiceAvailable()) return
    const on = !isVoiceEnabled()
    setVoiceEnabled(on)
    syncVoiceRow()
    showToast(on ? 'Мікрофон у полі увімкнено' : 'Мікрофон у полі вимкнено')
  })

  reg('settings-clear-chat', () => {
    clearHistory()
    syncChatRow()
    showToast('Історію чату очищено')
  })

  reg('settings-reset-demo', () => {
    seedFixtures(true)
    showToast('Демо-дані відновлено')
  })

  reg('settings-deploy-info', () => { close(); showDeployInfo() })
  reg('settings-refresh', () => { void hardRefresh() })
}

export function openSettings(): void {
  // A second open while the first is still fading out replaces its nodes;
  // the first one's onClose then fires later and must not drop the new handle.
  const handle = openCardModal({
    id: MODAL_ID,
    body: `
      <div class="settings-handle"></div>
      <div class="settings-title">Налаштування</div>
      <div class="settings-version">Roma OS · ${escapeHtml(deployLabel().split(' · ')[0])}</div>
      <div class="modal-scroll">
        <div class="s-group-label">Оболонка</div>
        <div class="s-group">
          ${row({
            action: 'settings-modules', icon: icons.cube, tone: 'amber',
            title: 'Модулі в барабані', sub: 'Що показувати в нижній панелі', right: CHEVRON,
          })}
          ${voiceRow()}
        </div>

        <div class="s-group-label">Дані</div>
        <div class="s-group">
          ${chatRow()}
          ${row({
            action: 'settings-reset-demo', icon: icons.refresh, tone: 'ink',
            title: 'Скинути демо-дані', sub: 'Стартовий набір: агенти, проєкти, події', right: CHEVRON,
          })}
          ${row({
            icon: icons.cube, tone: 'ink',
            title: 'Джерело даних', sub: 'Hermes ще не підключений',
            right: '<span class="s-value">Демо</span>',
          })}
        </div>

        <div class="s-group-label">Застосунок</div>
        <div class="s-group">
          ${row({
            action: 'settings-deploy-info', icon: icons.note, tone: 'ink',
            title: 'Інфо про деплой', sub: 'Версія, коміт, гілка',
            right: `<span class="s-value">${escapeHtml(deployLabel())}</span>${CHEVRON}`,
          })}
          ${row({
            action: 'settings-refresh', icon: icons.bolt, tone: 'amber',
            title: 'Оновити застосунок', sub: 'Скинути кеш і завантажити свіжу збірку', right: CHEVRON,
          })}
        </div>
      </div>`,
    onClose: () => { if (modal === handle) modal = null },
  })
  modal = handle
}

function close(): void {
  if (modal) modal.close()
  else closeCardModal(MODAL_ID)
}

interface RowSpec {
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
}

/** The donor's .s-row (index.html:1266–1279): icon, text, something on the right. */
function row(r: RowSpec): string {
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
  return `<button type="button" class="s-row"${id} data-action="${r.action}"${role}${r.disabled ? ' disabled' : ''}>${inner}</button>`
}

function toggle(on: boolean): string {
  return `<span class="s-toggle${on ? ' on' : ''}"><span class="s-toggle-thumb"></span></span>`
}

function voiceRow(): string {
  const available = isVoiceAvailable()
  const on = available && isVoiceEnabled()
  return row({
    action: 'settings-voice', id: 'settings-voice-row', icon: icons.mic, tone: 'amber',
    title: 'Голосовий ввід',
    sub: available ? 'Мікрофон у полі, українською' : 'Недоступний у цьому браузері',
    right: toggle(on), checked: on, disabled: !available,
  })
}

function chatRow(): string {
  const n = historyLength()
  return row({
    action: 'settings-clear-chat', id: 'settings-chat-row', icon: icons.broom, tone: 'ink',
    title: 'Очистити історію чату',
    sub: n > 0 ? count(n, 'повідомлення', 'повідомлення', 'повідомлень') : 'Порожньо',
    right: CHEVRON,
  })
}

function syncVoiceRow(): void {
  replaceRow('settings-voice-row', voiceRow())
}

function syncChatRow(): void {
  replaceRow('settings-chat-row', chatRow())
}

function replaceRow(id: string, html: string): void {
  const node = document.getElementById(id)
  if (node) node.outerHTML = html
}
