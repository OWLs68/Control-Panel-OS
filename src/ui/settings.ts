/**
 * Settings — NeverMind's panel (`index.html:1256–1567`, `nav.js:734–840`
 * `openSettings`/`closeSettings`), ported as a card modal: handle, title,
 * version line, a scroller of labelled groups, rows with an icon, a title, a
 * subtitle and a chevron, a value or a switch on the right.
 *
 * Only the rows Crow OS MP has a use for (Roman, 21.09) — not the donor's
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
import { getDataSource, getGatewayUrl, setDataSource, setGatewayUrl } from '../data/source.js'
import { normalizeGatewayUrl } from '../hermes/gateway.js'
import { openModules } from '../nav/shell.js'
import { openCardModal, closeCardModal, type CardModalHandle } from './card-modal.js'
import { deployLabel, hardRefresh, showDeployInfo } from './deploy-info.js'
import { icons } from './icons.js'
import { modalRow as row, modalToggle as toggle } from './modal-row.js'
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

  // Demo or live. The choice is a plain setting; the address is a hostname,
  // not a secret, and it is the only thing the phone needs to know.
  reg('settings-source', (data) => {
    const next = data.source === 'live' ? 'live' : 'demo'
    if (next === getDataSource()) return
    setDataSource(next)
    syncSourceRows()
    showToast(next === 'live' ? 'Джерело: наживо, через gateway' : 'Джерело: демо')
  })
  // Saved on blur and on Enter, like the donor's fields; a second fire with
  // the same value is a no-op, so Enter followed by the blur says it once.
  reg('settings-gateway-save', (_data, el) => {
    const input = el as HTMLInputElement
    const raw = input.value.trim()
    const cleaned = raw ? normalizeGatewayUrl(raw) : ''
    if (cleaned !== null && cleaned === getGatewayUrl()) { input.value = cleaned; return }
    if (!setGatewayUrl(raw)) { showToast('Адреса має починатись з https://'); return }
    input.value = getGatewayUrl()
    syncGatewayStatus()
    showToast(raw ? 'Адресу збережено' : 'Адресу прибрано')
    input.blur()
  })
}

export function openSettings(): void {
  // A second open while the first is still fading out replaces its nodes;
  // the first one's onClose then fires later and must not drop the new handle.
  const handle = openCardModal({
    id: MODAL_ID,
    body: `
      <div class="settings-handle"></div>
      <div class="settings-title">Налаштування</div>
      <div class="settings-version">Crow OS MP · ${escapeHtml(deployLabel().split(' · ')[0])}</div>
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
            title: 'Скинути демо-дані', sub: 'Агенти, проєкти, події; задачі не чіпає', right: CHEVRON,
          })}
          ${sourceRow()}
          ${gatewayRow()}
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

/** Demo ⇄ live — the donor's choice pills (currency/language rows) on the right. */
function sourceRow(): string {
  const live = getDataSource() === 'live'
  const pill = (value: 'demo' | 'live', label: string, on: boolean) =>
    `<button type="button" class="s-pill${on ? ' active' : ''}" data-action="settings-source" data-source="${value}" aria-pressed="${on}">${label}</button>`
  return row({
    id: 'settings-source-row', icon: icons.cube, tone: live ? 'amber' : 'ink',
    title: 'Джерело даних',
    sub: live ? 'Памʼять з GBrain і Crow через Hermes — через gateway на Mac; решта поки демо' : 'Стартовий набір, локально',
    right: `<span class="s-pill-group">${pill('demo', 'Демо', !live)}${pill('live', 'Наживо', live)}</span>`,
  })
}

/** The gateway's address — the donor's API-key row: a stacked field with a status pill. Live only. */
function gatewayRow(): string {
  if (getDataSource() !== 'live') return ''
  const url = getGatewayUrl()
  return `<div class="s-row s-row-static s-row-column" id="settings-gateway-row">
    <input class="settings-input" type="url" id="settings-gateway-url" value="${escapeHtml(url)}"
      placeholder="https://mac…ts.net" aria-label="Адреса gateway"
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="url" enterkeyhint="done"
      data-on-blur="settings-gateway-save" data-on-enter="settings-gateway-save">
    <div class="key-status ${url ? 'has-key' : 'no-key'}" id="settings-gateway-status">${url ? 'Адресу задано' : '⚠️ Адресу не задано'}</div>
  </div>`
}

function syncSourceRows(): void {
  replaceRow('settings-source-row', sourceRow())
  document.getElementById('settings-gateway-row')?.remove()
  const extra = gatewayRow()
  if (extra) document.getElementById('settings-source-row')?.insertAdjacentHTML('afterend', extra)
}

function syncGatewayStatus(): void {
  const status = document.getElementById('settings-gateway-status')
  if (!status) return
  const url = getGatewayUrl()
  status.className = `key-status ${url ? 'has-key' : 'no-key'}`
  status.textContent = url ? 'Адресу задано' : '⚠️ Адресу не задано'
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
