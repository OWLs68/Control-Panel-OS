/**
 * The one Crow chat.
 *
 * This is a PORT of NeverMind's chat bar, not a reimplementation. Sources:
 *   src/ai/core.js:894-975      openChatBar / closeChatBar
 *   src/owl/inbox-board.js:25-260  three states, heights, the whole drag
 *   src/core/utils.js:5-39      autoResizeTextarea, updateChatWindowHeight
 *   src/tabs/inbox.js:47-120    bubble markup, typing, time separator
 *   src/ai/core.js:800-870      history restore + "попередня розмова" divider
 *   src/ui/unread-badge.js      the red counter on the send button
 *
 * Every number is the donor's: 320px cap on state A, 250px keyboard threshold,
 * ±40/80px and 0.5px/ms gesture thresholds, 0.32/0.38/0.28s curves, the 110%
 * slide-out, the 5-minute gap before a time divider, 30 messages of history.
 *
 * The one structural departure is Roman's own decision: Roma OS has ONE chat
 * for the whole app, so there is a single bar and a single state, where
 * NeverMind keeps a bar and a state per tab.
 */
import { $, escapeHtml } from '../core/dom.js'
import { reg } from '../core/delegation.js'
import { generateUUID } from '../core/uuid.js'
import { buildUiContext, describeContext } from '../core/ui-context.js'
import { askCrow } from '../hermes/gateway.js'
import { describeError, type CrowChip, type CrowTurn } from '../hermes/contract.js'
import { crowSpeaking, setChips } from './board.js'
import { renderChips, type ChipHandlers } from './chips.js'
import { showToast } from '../ui/toast.js'

export type ChatState = 'closed' | 'a' | 'b'

const HISTORY_KEY = 'roma_chat'
const DRAFT_KEY = 'roma_chat_draft'
const MAX_HISTORY = 30

/** NeverMind's numbers. Do not round them off. */
const A_MAX_HEIGHT = 320          // inbox-board.js:45
const A_MIN_HEIGHT = 200          // inbox-board.js:45
const A_MIN_WITH_KEYBOARD = 150   // inbox-board.js:42
const B_MIN_HEIGHT = 250          // inbox-board.js:54
const B_TOP_BOUND = 80            // inbox-board.js:54 — top of the screen
const BOARD_GAP = 8
const KEYBOARD_THRESHOLD = 250    // keyboard.js — below this it is Safari's toolbar
const DRAG_START = 8              // inbox-board.js:113
const AXIS_RATIO = 1.5            // horizontal wins if |dx| > |dy| * 1.5
const EXPAND_DY = -40             // A → B
const COLLAPSE_DY = 80            // B → A, A → closed
const COLLAPSE_VELOCITY = 0.5     // px/ms
const INPUT_SWIPE_DY = 20         // swipe up from the input opens without keyboard
const TIME_GAP_MS = 5 * 60 * 1000 // divider after a 5-minute pause

let state: ChatState = 'closed'
let sending = false
let unread = 0
let lastUserMsgTs = 0
let typingEl: HTMLElement | null = null
let chipHandlers: ChipHandlers = { onChat: () => {}, onNav: () => {}, onOpen: () => {} }

export function getChatState(): ChatState { return state }

export function setupChat(handlers: ChipHandlers): void {
  chipHandlers = handlers

  const input = $<HTMLTextAreaElement>('#crow-input')
  if (input) {
    input.value = readDraft()
    input.addEventListener('input', () => { autoResizeTextarea(input); saveDraft(input.value) })
    // Focusing the field is a request to talk, so the chat opens with it —
    // NeverMind wires the same thing through data-on-focus="open-chat-bar".
    input.addEventListener('focus', () => { if (state === 'closed') openChatBar() })
  }

  reg('send-crow', () => { void send() })
  reg('pick-chat-image', () => {
    // The button is part of the bar. Vision goes through Hermes, which does not
    // exist yet, so it says so rather than opening a picker that leads nowhere.
    showToast('Фото піде через Hermes — його ще немає')
  })

  setupChatBarSwipe()
  restoreChatUI()
}

/* ── Heights — utils.js:18 and inbox-board.js:28/48 ──────────────────── */

function inputTop(): number {
  const box = $('#crow-input-box')
  return box ? box.getBoundingClientRect().top : window.innerHeight - 100
}

function keyboardHeight(): number {
  const vv = window.visualViewport
  return vv ? Math.max(0, window.innerHeight - vv.height) : 0
}

/** Bottom of the Crow zone — what the chat must not cover. */
function boardBottom(): number {
  const zone = document.getElementById('crow-zone')
  if (!zone) return B_TOP_BOUND
  const rect = zone.getBoundingClientRect()
  return rect.bottom > 0 ? rect.bottom + BOARD_GAP : B_TOP_BOUND
}

/** State A: comfortable and small. Capped at 320 without a keyboard. */
export function heightA(): number {
  const free = inputTop() - boardBottom() - BOARD_GAP
  if (keyboardHeight() > KEYBOARD_THRESHOLD) return Math.max(A_MIN_WITH_KEYBOARD, free)
  return Math.max(A_MIN_HEIGHT, Math.min(A_MAX_HEIGHT, free))
}

/** State B: from the top of the screen down to the input. */
export function heightB(): number {
  return Math.max(B_MIN_HEIGHT, inputTop() - B_TOP_BOUND - BOARD_GAP)
}

/** utils.js:18 — recompute while the textarea grows under the window. */
export function updateChatWindowHeight(): void {
  const win = $('#crow-chat-window')
  if (!win || state === 'closed') return
  const height = state === 'b' ? heightB() : heightA()
  win.style.height = `${height}px`
  win.style.maxHeight = `${height}px`
}

/** utils.js:5 — grows to half the screen, then scrolls. */
export function autoResizeTextarea(el: HTMLTextAreaElement): void {
  el.style.height = 'auto'
  const max = Math.floor(window.innerHeight * 0.5 - 20)
  el.style.height = `${Math.min(el.scrollHeight, max)}px`
  updateChatWindowHeight()
}

/* ── Open / close — core.js:894 and :939 ─────────────────────────────── */

export function openChatBar(): void {
  const win = $('#crow-chat-window')
  if (!win) return
  clearUnreadBadge()
  // rAF so the height is measured after the bar has settled, as the donor does.
  requestAnimationFrame(() => {
    const height = heightA()
    win.style.height = `${height}px`
    win.style.maxHeight = `${height}px`
    win.classList.add('open')
    state = 'a'
    updateContextLine()
    scrollToEnd()
  })
}

/** Opened by swiping up from the input — no keyboard. inbox-board.js:57 */
function openChatBarNoKeyboard(): void {
  if (state !== 'closed') return
  openChatBar()
}

/** Closing hides the window. It never clears the draft — core.js:947. */
export function closeChatBar(): void {
  const win = $('#crow-chat-window')
  if (!win) return
  state = 'closed'
  win.classList.remove('open')
  win.style.height = ''
  win.style.maxHeight = ''
  $<HTMLTextAreaElement>('#crow-input')?.blur()
}

/** The keyboard handler calls this: B does not fit once the keyboard is up. */
export function collapseToA(): void {
  if (state !== 'b') return
  const win = $('#crow-chat-window')
  if (!win) return
  state = 'a'
  const height = heightA()
  win.style.transition = 'height 0.3s cubic-bezier(0.32,0.72,0,1)'
  win.style.height = `${height}px`
  win.style.maxHeight = `${height}px`
  setTimeout(() => { win.style.transition = '' }, 300)
}

export function resizeToState(): void {
  updateChatWindowHeight()
}

/* ── The drag — inbox-board.js:79-260, ported ────────────────────────── */

function setupChatBarSwipe(): void {
  const handle = $('#crow-chat-handle')
  const win = $('#crow-chat-window')
  const bar = $('#crow-ai-bar')
  const messages = $('#crow-chat-messages')
  if (!handle || !win || !bar) return

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
    // Pin the current height in px so A↔B can animate from it.
    if (state !== 'closed') win.style.height = `${win.offsetHeight}px`
    win.style.transform = 'translateY(0)'
  }, { passive: true })

  handle.addEventListener('touchmove', (e) => {
    const t = e.touches[0]
    if (!t) return
    e.preventDefault()   // the handle is for dragging only, never page scroll
    // iOS shifts the visual viewport while the keyboard settles; without this
    // correction the drag jumps by however much the page was pushed up.
    const viewportDelta = (window.visualViewport?.offsetTop ?? 0) - startViewportTop
    const dy = t.clientY - startY + viewportDelta
    const absDy = Math.abs(dy)
    const dx = Math.abs(t.clientX - startX)
    const keyboardDown = keyboardHeight() <= KEYBOARD_THRESHOLD

    if (state === 'b') {
      if (!dragging) {
        if (absDy < DRAG_START) return
        if (dx > absDy * AXIS_RATIO) return
        dragging = true
      }
      if (dy <= 0) { win.style.transform = 'translateY(0)'; return }
      win.style.transform = `translateY(${Math.min(dy * 0.7, 140)}px)`
      win.style.opacity = Math.max(0.7, 1 - dy / 400).toFixed(2)
      return
    }

    // State A: up expands towards B, down closes.
    if (!dragging) {
      if (absDy < DRAG_START) return
      if (dx > absDy * AXIS_RATIO) return
      dragging = true
    }
    if (dy < 0 && keyboardDown) {
      const max = heightB()
      const from = parseFloat(win.style.height) || win.offsetHeight
      const next = Math.min(max, from - dy)
      win.style.height = `${next}px`
      win.style.maxHeight = `${next}px`
      win.style.transform = 'translateY(0)'
      win.style.opacity = '1'
      return
    }
    if (dy > 0) {
      win.style.transform = `translateY(${dy}px)`
      win.style.opacity = Math.max(0, 1 - dy / 280).toFixed(2)
    }
  }, { passive: false })

  const cancel = () => {
    win.style.transition = 'transform 0.28s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease'
    win.style.transform = 'translateY(0)'
    win.style.opacity = '1'
    setTimeout(() => {
      win.style.transition = ''
      win.style.transform = ''
      win.style.opacity = ''
    }, 280)
    dragging = false
  }
  handle.addEventListener('touchcancel', cancel, { passive: true })

  handle.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]
    if (!t) return
    const finalDy = t.clientY - startY
    const elapsed = Math.max(1, Date.now() - startedAt)
    const velocity = finalDy / elapsed
    const keyboardDown = keyboardHeight() <= KEYBOARD_THRESHOLD
    dragging = false

    if (state === 'b') {
      if (finalDy > COLLAPSE_DY || velocity > COLLAPSE_VELOCITY) {
        const aH = heightA()
        state = 'a'
        win.style.transition = 'height 0.32s cubic-bezier(0.32,0.72,0,1), transform 0.28s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease'
        win.style.height = `${aH}px`
        win.style.maxHeight = `${aH}px`
        win.style.transform = 'translateY(0)'
        win.style.opacity = '1'
        setTimeout(() => { win.style.transition = '' }, 320)
      } else {
        const bH = heightB()
        win.style.transition = 'height 0.28s cubic-bezier(0.32,0.72,0,1), transform 0.28s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease'
        win.style.height = `${bH}px`
        win.style.maxHeight = `${bH}px`
        win.style.transform = 'translateY(0)'
        win.style.opacity = '1'
        setTimeout(() => { win.style.transition = '' }, 280)
      }
      return
    }

    if (finalDy < EXPAND_DY && keyboardDown) {
      // A → B
      const bH = heightB()
      state = 'b'
      win.style.transition = 'height 0.38s cubic-bezier(0.3,0.82,0,1)'
      win.style.height = `${bH}px`
      win.style.maxHeight = `${bH}px`
      win.style.transform = ''
      win.style.opacity = '1'
      setTimeout(scrollToEnd, 380)
      setTimeout(() => { win.style.transition = '' }, 380)
    } else if (finalDy > COLLAPSE_DY || velocity > COLLAPSE_VELOCITY) {
      // A → closed
      win.style.transition = 'transform 0.28s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease'
      win.style.transform = 'translateY(110%)'
      win.style.opacity = '0'
      setTimeout(() => {
        closeChatBar()
        win.style.transition = ''
        win.style.transform = ''
        win.style.opacity = ''
      }, 280)
    } else {
      // Spring back to A
      const aH = heightA()
      win.style.transition = 'height 0.28s cubic-bezier(0.32,0.72,0,1), transform 0.28s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease'
      win.style.height = `${aH}px`
      win.style.maxHeight = `${aH}px`
      win.style.transform = 'translateY(0)'
      win.style.opacity = '1'
      setTimeout(() => { win.style.transition = '' }, 280)
    }
  }, { passive: true })

  // Block unwanted scrolling on the rest of the bar — but not the message list
  // and not the textarea.
  bar.addEventListener('touchmove', (e) => {
    const target = e.target as Node
    if (messages?.contains(target)) return
    const textarea = $('#crow-input')
    if (textarea?.contains(target) || textarea === target) return
    e.preventDefault()
  }, { passive: false })

  // Swipe up from the input opens the chat WITHOUT summoning the keyboard.
  const box = $('#crow-input-box')
  if (box) {
    let inStartY = 0
    let swiping = false
    box.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      if (!t) return
      inStartY = t.clientY
      swiping = false
    }, { passive: true })
    box.addEventListener('touchmove', (e) => {
      if (state !== 'closed') return
      const t = e.touches[0]
      if (!t) return
      if (inStartY - t.clientY > INPUT_SWIPE_DY) {
        swiping = true
        e.preventDefault()   // stop the textarea taking focus mid-swipe
      }
    }, { passive: false })
    box.addEventListener('touchend', (e) => {
      if (!swiping) return
      swiping = false
      e.preventDefault()     // and stop the tap that would raise the keyboard
      openChatBarNoKeyboard()
    }, { passive: false })
  }
}

/* ── History — core.js:677-870 ───────────────────────────────────────── */

export function loadHistory(): CrowTurn[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as CrowTurn[]) : []
  } catch { return [] }
}

/** How many turns are saved — the settings row shows the number. */
export function historyLength(): number { return loadHistory().length }

/**
 * Settings → «Очистити історію чату». Storage and the window; the draft in
 * the field stays, as it does across every other close (core.js:947).
 */
export function clearHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY) } catch { /* private mode */ }
  lastUserMsgTs = 0
  clearUnreadBadge()
  const list = $('#crow-chat-messages')
  if (!list) return
  hideTyping()
  list.innerHTML = ''
  delete list.dataset.restored
  restoreChatUI()
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

/** core.js:800 — replay the saved conversation under a divider. */
function restoreChatUI(): void {
  const list = $('#crow-chat-messages')
  if (!list || list.dataset.restored) return
  list.dataset.restored = '1'

  const turns = loadHistory()
  if (turns.length === 0) {
    list.insertAdjacentHTML('beforeend', bubbleRow('agent',
      'Привіт! Один чат на весь застосунок — я бачу, де ти зараз.'))
    return
  }

  list.insertAdjacentHTML('beforeend', separator('Попередня розмова', true))
  for (const turn of turns) list.insertAdjacentHTML('beforeend', bubbleRow(turn.role, turn.text))
  scrollToEnd()
}

/* ── Rendering — inbox.js:47-120 ─────────────────────────────────────── */

function bubbleRow(role: 'user' | 'agent', text: string): string {
  const isAgent = role === 'agent'
  return `<div class="msg-row ${isAgent ? 'msg-row-agent' : 'msg-row-user'}">
    <div class="msg-bubble msg-bubble--${isAgent ? 'agent' : 'user'}">${escapeHtml(text)}</div>
  </div>`
}

function separator(label: string, history = false): string {
  return `<div class="msg-sep${history ? ' msg-sep-history' : ''}">
    <div class="msg-sep-line"></div>
    <div class="msg-sep-text">${escapeHtml(label)}</div>
    <div class="msg-sep-line"></div>
  </div>`
}

function addMsg(role: 'user' | 'agent', text: string, chips: CrowChip[] = []): void {
  const list = $('#crow-chat-messages')
  if (!list) return

  hideTyping()
  // Chips belong to the latest question only.
  if (role === 'agent') list.querySelectorAll('.chat-chips-row').forEach((n) => n.remove())

  // A pause longer than five minutes gets a divider, so the thread reads right
  // when you come back to it hours later.
  if (role === 'user') {
    const now = Date.now()
    const gap = now - lastUserMsgTs
    if (lastUserMsgTs > 0 && gap > TIME_GAP_MS) {
      const mins = Math.round(gap / 60000)
      const label = mins < 60 ? `${mins} хв тому`
        : mins < 1440 ? `${Math.round(mins / 60)} год тому`
        : 'раніше'
      list.insertAdjacentHTML('beforeend', separator(label))
    }
    lastUserMsgTs = now
  }

  list.insertAdjacentHTML('beforeend', bubbleRow(role, text))

  if (role === 'agent' && chips.length > 0) {
    const row = document.createElement('div')
    row.className = 'chat-chips-row'
    renderChips(row, chips, chipHandlers)
    list.appendChild(row)
    requestAnimationFrame(() => row.scrollIntoView({ block: 'end', inline: 'nearest' }))
  }

  scrollToEnd()
}

function showTyping(): void {
  const list = $('#crow-chat-messages')
  if (!list || typingEl) return
  const row = document.createElement('div')
  row.className = 'msg-row msg-row-agent'
  row.innerHTML = `<div class="msg-bubble msg-bubble--agent" style="padding:5px 10px"><div class="ai-typing"><span></span><span></span><span></span></div></div>`
  list.appendChild(row)
  typingEl = row
  scrollToEnd()
}

function hideTyping(): void {
  typingEl?.remove()
  typingEl = null
}

function scrollToEnd(): void {
  const list = $('#crow-chat-messages')
  if (!list) return
  list.scrollTop = list.scrollHeight
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight })
}

/* ── Unread badge — unread-badge.js ──────────────────────────────────── */

function showUnreadBadge(): void {
  unread += 1
  const btn = $('#crow-send-btn')
  if (!btn) return
  let badge = $('#crow-chat-badge')
  if (!badge) {
    badge = document.createElement('div')
    badge.id = 'crow-chat-badge'
    badge.style.cssText = 'position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#C6544B;color:white;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:10'
    btn.appendChild(badge)
  }
  badge.textContent = unread > 9 ? '9+' : String(unread)
}

export function clearUnreadBadge(): void {
  unread = 0
  $('#crow-chat-badge')?.remove()
}

/* ── Sending ─────────────────────────────────────────────────────────── */

export function updateContextLine(): void {
  const line = $('#chat-context')
  if (!line) return
  line.textContent = describeContext(buildUiContext())
}

/** Sends a chip's label as if Roman had typed it himself. */
export function sendText(text: string): void {
  const input = $<HTMLTextAreaElement>('#crow-input')
  if (input) input.value = text
  void send()
}

async function send(): Promise<void> {
  const input = $<HTMLTextAreaElement>('#crow-input')
  const text = input?.value.trim() ?? ''
  if (!text || sending) return

  sending = true
  if (input) { input.value = ''; autoResizeTextarea(input); saveDraft('') }
  if (state === 'closed') openChatBar()

  addMsg('user', text)
  pushTurn({ role: 'user', text, ts: Date.now() })
  updateContextLine()
  showTyping()
  crowSpeaking(true)

  // The envelope is built HERE, at send time: Roman may have opened a blocker
  // between typing and sending.
  const context = buildUiContext()

  try {
    const reply = await askCrow({
      text,
      context,
      history: loadHistory().slice(-10),
      requestId: generateUUID(),
    })
    addMsg('agent', reply.text, reply.chips)
    pushTurn({ role: 'agent', text: reply.text, ts: Date.now() })
    if (reply.chips.length) setChips(reply.chips)
    if (state === 'closed') showUnreadBadge()
  } catch (err) {
    const message = describeError(err)
    addMsg('agent', message)
    pushTurn({ role: 'agent', text: message, ts: Date.now() })
  } finally {
    crowSpeaking(false)
    sending = false
  }
}
