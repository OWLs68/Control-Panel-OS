/**
 * The one Crow chat.
 *
 * Roma OS has a single conversation for the whole app: one history, one
 * session, one visual state. Moving between modules does not start a new
 * thread and does not clear what you were typing — which is the point where
 * this deliberately parts company with NeverMind, where each of the eight tabs
 * owns its own chat and switching tabs closes them all.
 *
 * What is ported, because it is already right:
 *   - three states (closed / A compact / B full) with computed heights;
 *   - the handle owns the drag, the message list keeps native scrolling, so the
 *     two gestures never fight;
 *   - thresholds 40px up to expand, 80px or 0.5px/ms down to collapse;
 *   - swipe up from the input opens the chat WITHOUT raising the keyboard;
 *   - closing never wipes the draft;
 *   - unread badge, typing dots, asymmetric bubbles, 30 messages of history.
 *
 * What is ours: the context envelope line, and the fact that all of the above
 * is global rather than per-tab.
 */
import { $, autoResize, escapeHtml } from '../core/dom.js'
import { reg } from '../core/delegation.js'
import { generateUUID } from '../core/uuid.js'
import { icons } from '../ui/icons.js'
import { buildUiContext, describeContext } from '../core/ui-context.js'
import { askCrow } from '../hermes/gateway.js'
import { describeError, type CrowTurn } from '../hermes/contract.js'
import { crowSpeaking, setChips } from './board.js'

export type ChatState = 'closed' | 'a' | 'b'

const HISTORY_KEY = 'roma_chat'
const DRAFT_KEY = 'roma_chat_draft'
const MAX_HISTORY = 30
const A_MAX_HEIGHT = 320
const KEYBOARD_THRESHOLD = 250
const EXPAND_DY = -40
const COLLAPSE_DY = 80
const COLLAPSE_VELOCITY = 0.5

let dock: HTMLElement | null = null
let state: ChatState = 'closed'
let unread = 0
let sending = false

export function getChatState(): ChatState { return state }

export function setupChat(root: HTMLElement): void {
  dock = root

  root.innerHTML = `
    <div class="chat-window" id="chat-window">
      <div class="chat-handle" id="chat-handle" aria-label="Потягни щоб згорнути"></div>
      <div class="chat-context" id="chat-context"></div>
      <div class="chat-messages" id="chat-messages" role="log"></div>
    </div>
    <div class="chat-input-box" id="chat-input-box">
      <textarea class="chat-input" id="chat-input" rows="1" placeholder="Скажи Crow…"
                data-on-enter="send-crow" enterkeyhint="send"></textarea>
      <button class="icon-btn" id="mic-btn" data-action="crow-voice" aria-label="Голосовий ввід" hidden>${icons.mic}</button>
      <button class="icon-btn icon-btn-send" data-action="send-crow" aria-label="Надіслати">${icons.send}</button>
      <span class="unread-badge" id="unread-badge" hidden>0</span>
    </div>`

  const input = $<HTMLTextAreaElement>('#chat-input', root)
  if (input) {
    input.value = readDraft()
    input.addEventListener('input', () => { autoResize(input); saveDraft(input.value) })
    // Focusing the field is a request to talk, so the chat opens with it.
    input.addEventListener('focus', () => { if (state === 'closed') openChat('a') })
  }

  reg('send-crow', () => { void send() })
  attachHandleDrag()
  attachInputSwipe()
  renderHistory()
}

/* ── Heights ─────────────────────────────────────────────────────────── */

function inputTop(): number {
  const box = $('#chat-input-box')
  return box ? box.getBoundingClientRect().top : window.innerHeight - 100
}

function keyboardHeight(): number {
  const vv = window.visualViewport
  return vv ? Math.max(0, window.innerHeight - vv.height) : 0
}

/** Compact: fills what is free between the Crow zone and the input, capped. */
export function heightA(): number {
  const zone = document.getElementById('crow-zone')
  const zoneBottom = zone && zone.getBoundingClientRect().bottom > 0
    ? zone.getBoundingClientRect().bottom + 8
    : 80
  const free = inputTop() - zoneBottom - 8
  if (keyboardHeight() > KEYBOARD_THRESHOLD) return Math.max(150, free)
  return Math.max(200, Math.min(A_MAX_HEIGHT, free))
}

/** Full: from just under the top bar down to the input. */
export function heightB(): number {
  const topbar = document.getElementById('topbar')
  const top = topbar ? topbar.getBoundingClientRect().bottom + 8 : 80
  return Math.max(250, inputTop() - top)
}

function applyHeight(height: number, animate = true): void {
  const win = $('#chat-window')
  if (!win) return
  win.style.transition = animate
    ? 'height var(--motion-slow) var(--ease-spring), transform var(--motion-normal) var(--ease-spring), opacity var(--motion-normal) var(--ease-smooth)'
    : 'none'
  win.style.height = `${height}px`
  win.style.maxHeight = `${height}px`
  if (animate) setTimeout(() => { win.style.transition = '' }, 380)
}

/* ── Open / close ────────────────────────────────────────────────────── */

export function openChat(next: 'a' | 'b' = 'a'): void {
  const win = $('#chat-window')
  if (!win) return
  state = next
  dock?.classList.add('chat-open')
  win.classList.add('open')
  win.style.transform = ''
  win.style.opacity = ''
  applyHeight(next === 'b' ? heightB() : heightA())
  clearUnread()
  updateContextLine()
  scrollToEnd()
}

/** Closing hides the window. It never clears the draft — that is the rule. */
export function closeChat(): void {
  const win = $('#chat-window')
  if (!win) return
  state = 'closed'
  dock?.classList.remove('chat-open')
  win.classList.remove('open')
  win.style.height = '0px'
  win.style.maxHeight = '0px'
  $<HTMLTextAreaElement>('#chat-input')?.blur()
}

/** Called by the keyboard handler: B does not fit once the keyboard is up. */
export function collapseToA(): void {
  if (state !== 'b') return
  state = 'a'
  applyHeight(heightA())
}

export function resizeToState(): void {
  if (state === 'closed') return
  applyHeight(state === 'b' ? heightB() : heightA(), false)
}

/* ── Gestures ────────────────────────────────────────────────────────── */

function attachHandleDrag(): void {
  const handle = $('#chat-handle')
  const win = $('#chat-window')
  if (!handle || !win) return

  let startY = 0
  let startX = 0
  let startViewportTop = 0
  let startedAt = 0
  let dragging = false

  handle.addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    if (!t) return
    startY = t.clientY
    startX = t.clientX
    startViewportTop = window.visualViewport?.offsetTop ?? 0
    startedAt = Date.now()
    dragging = false
    win.style.transition = 'none'
    win.style.opacity = '1'
    if (state !== 'closed') win.style.height = `${win.offsetHeight}px`
    win.style.transform = 'translateY(0)'
  }, { passive: true })

  handle.addEventListener('touchmove', (e) => {
    const t = e.touches[0]
    if (!t) return
    e.preventDefault()  // the handle is for dragging only, never page scroll
    // iOS shifts the visual viewport while the keyboard settles; without this
    // correction the drag jumps by however much the page was pushed up.
    const viewportDelta = (window.visualViewport?.offsetTop ?? 0) - startViewportTop
    const dy = t.clientY - startY + viewportDelta
    const dx = Math.abs(t.clientX - startX)
    const absDy = Math.abs(dy)
    const keyboardDown = keyboardHeight() <= KEYBOARD_THRESHOLD

    if (!dragging) {
      if (absDy < 8) return
      if (dx > absDy * 1.5) return   // that is a horizontal gesture, not ours
      dragging = true
    }

    if (state === 'b') {
      if (dy <= 0) { win.style.transform = 'translateY(0)'; return }
      win.style.transform = `translateY(${Math.min(dy * 0.7, 140)}px)`
      win.style.opacity = Math.max(0.7, 1 - dy / 400).toFixed(2)
      return
    }

    if (dy < 0 && keyboardDown) {
      const max = heightB()
      const from = parseFloat(win.style.height) || win.offsetHeight
      win.style.height = `${Math.min(max, from - dy)}px`
      win.style.maxHeight = `${Math.min(max, from - dy)}px`
      return
    }
    if (dy > 0) {
      win.style.transform = `translateY(${dy}px)`
      win.style.opacity = Math.max(0, 1 - dy / 280).toFixed(2)
    }
  }, { passive: false })

  handle.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]
    if (!t) return
    const dy = t.clientY - startY
    const velocity = dy / Math.max(1, Date.now() - startedAt)
    const keyboardDown = keyboardHeight() <= KEYBOARD_THRESHOLD
    dragging = false

    if (state === 'b') {
      if (dy > COLLAPSE_DY || velocity > COLLAPSE_VELOCITY) { state = 'a'; applyHeight(heightA()) }
      else applyHeight(heightB())
      win.style.transform = 'translateY(0)'
      win.style.opacity = '1'
      return
    }

    if (dy < EXPAND_DY && keyboardDown) {
      state = 'b'
      applyHeight(heightB())
      setTimeout(scrollToEnd, 380)
    } else if (dy > COLLAPSE_DY || velocity > COLLAPSE_VELOCITY) {
      win.style.transition = 'transform var(--motion-normal) var(--ease-spring), opacity var(--motion-normal) var(--ease-smooth)'
      win.style.transform = 'translateY(110%)'
      win.style.opacity = '0'
      setTimeout(() => {
        closeChat()
        win.style.transition = ''
        win.style.transform = ''
        win.style.opacity = ''
      }, 260)
    } else {
      applyHeight(heightA())
      win.style.transform = 'translateY(0)'
      win.style.opacity = '1'
    }
  }, { passive: true })

  handle.addEventListener('touchcancel', () => {
    win.style.transition = 'transform var(--motion-normal) var(--ease-spring)'
    win.style.transform = 'translateY(0)'
    win.style.opacity = '1'
    dragging = false
  }, { passive: true })
}

/** Swipe up from the input opens the chat without summoning the keyboard. */
function attachInputSwipe(): void {
  const box = $('#chat-input-box')
  if (!box) return
  let startY = 0
  let swiping = false

  box.addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    if (!t) return
    startY = t.clientY
    swiping = false
  }, { passive: true })

  box.addEventListener('touchmove', (e) => {
    if (state !== 'closed') return
    const t = e.touches[0]
    if (!t) return
    if (startY - t.clientY > 20) {
      swiping = true
      e.preventDefault()   // stop the textarea taking focus mid-swipe
    }
  }, { passive: false })

  box.addEventListener('touchend', (e) => {
    if (!swiping) return
    swiping = false
    e.preventDefault()     // and stop the tap that would raise the keyboard
    openChat('a')
  }, { passive: false })
}

/* ── History ─────────────────────────────────────────────────────────── */

export function loadHistory(): CrowTurn[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as CrowTurn[]) : []
  } catch { return [] }
}

function saveHistory(turns: CrowTurn[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(turns.slice(-MAX_HISTORY))) } catch { /* quota */ }
}

function pushTurn(turn: CrowTurn): void {
  saveHistory([...loadHistory(), turn])
}

function readDraft(): string {
  try { return localStorage.getItem(DRAFT_KEY) ?? '' } catch { return '' }
}

function saveDraft(text: string): void {
  try { localStorage.setItem(DRAFT_KEY, text) } catch { /* quota */ }
}

function renderHistory(): void {
  const list = $('#chat-messages')
  if (!list) return
  const turns = loadHistory()
  list.innerHTML = turns.length
    ? turns.map((t) => bubble(t.role, t.text)).join('')
    : `<div class="msg msg-system">Один чат на весь застосунок. Crow бачить, де ти зараз.</div>`
  scrollToEnd()
}

function bubble(role: 'user' | 'agent', text: string): string {
  return `<div class="msg msg-${role === 'user' ? 'user' : 'agent'}">${escapeHtml(text)}</div>`
}

function addMessage(role: 'user' | 'agent', text: string): void {
  const list = $('#chat-messages')
  if (!list) return
  list.querySelector('.msg-system')?.remove()
  list.insertAdjacentHTML('beforeend', bubble(role, text))
  scrollToEnd()
}

function showTyping(): void {
  const list = $('#chat-messages')
  if (!list) return
  list.insertAdjacentHTML('beforeend', `<div class="msg msg-agent typing" id="typing"><i></i><i></i><i></i></div>`)
  scrollToEnd()
}

function hideTyping(): void { $('#typing')?.remove() }

function scrollToEnd(): void {
  const list = $('#chat-messages')
  if (list) setTimeout(() => { list.scrollTop = list.scrollHeight }, 40)
}

/* ── Unread ──────────────────────────────────────────────────────────── */

function bumpUnread(): void {
  unread += 1
  const badge = $('#unread-badge')
  if (!badge) return
  badge.textContent = String(unread)
  badge.hidden = false
}

export function clearUnread(): void {
  unread = 0
  const badge = $('#unread-badge')
  if (badge) badge.hidden = true
}

/* ── Sending ─────────────────────────────────────────────────────────── */

export function updateContextLine(): void {
  const line = $('#chat-context')
  if (!line) return
  line.textContent = describeContext(buildUiContext())
}

/** Sends a chip's label as if Roman had typed it himself. */
export function sendText(text: string): void {
  const input = $<HTMLTextAreaElement>('#chat-input')
  if (input) input.value = text
  void send()
}

async function send(): Promise<void> {
  const input = $<HTMLTextAreaElement>('#chat-input')
  const text = input?.value.trim() ?? ''
  if (!text || sending) return

  sending = true
  if (input) { input.value = ''; autoResize(input); saveDraft('') }
  if (state === 'closed') openChat('a')

  addMessage('user', text)
  pushTurn({ role: 'user', text, ts: Date.now() })
  updateContextLine()
  showTyping()
  crowSpeaking(true)

  // The envelope is built HERE, at send time, not when the chat opened: Roman
  // may have opened a blocker between typing and sending.
  const context = buildUiContext()

  try {
    const reply = await askCrow({
      text,
      context,
      history: loadHistory().slice(-10),
      requestId: generateUUID(),
    })
    hideTyping()
    addMessage('agent', reply.text)
    pushTurn({ role: 'agent', text: reply.text, ts: Date.now() })
    if (reply.chips.length) setChips(reply.chips)
    if (state === 'closed') bumpUnread()
  } catch (err) {
    hideTyping()
    const message = describeError(err)
    addMessage('agent', message)
    pushTurn({ role: 'agent', text: message, ts: Date.now() })
  } finally {
    crowSpeaking(false)
    sending = false
  }
}
