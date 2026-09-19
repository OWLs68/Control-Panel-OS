/**
 * The Crow zone.
 *
 * One character, one bubble, one chip strip, for the whole app — the same agent
 * with the same voice, saying something relevant to wherever you are. Behaviour
 * is NeverMind's board: swipe up to collapse, swipe down to expand, priority
 * colours the bubble, the text cross-fades instead of snapping, and a message
 * that has gone stale says how old it is rather than quietly lying.
 *
 * The geometry is ours (HANDOFF §3.5) and has no donor.
 */
import { $, escapeHtml, relativeTime } from '../core/dom.js'
import { regTouch } from '../core/touch.js'
import { reg } from '../core/delegation.js'
import { icons } from '../ui/icons.js'
import { CrowCharacter } from './character.js'
import { renderChips, updateChipArrows, type ChipHandlers } from './chips.js'
import type { CrowChip } from '../hermes/contract.js'

export type ZoneState = 'expanded' | 'collapsed'

export interface BoardMessage {
  title: string
  text: string
  priority: 'normal' | 'urgent' | 'success'
  chips: CrowChip[]
  ts: number
}

const FADE_MS = 200
const STALE_AFTER = 10 * 60 * 1000

let zone: HTMLElement | null = null
let character: CrowCharacter | null = null
let state: ZoneState = 'expanded'
let current: BoardMessage | null = null
let handlers: ChipHandlers = { onChat: () => {}, onNav: () => {}, onOpen: () => {} }

export function setupCrowZone(root: HTMLElement, chipHandlers: ChipHandlers): void {
  zone = root
  handlers = chipHandlers
  character = new CrowCharacter({ pose: 'front', height: 172, tilt: 14 })

  root.dataset.state = 'expanded'
  root.innerHTML = `
    <div class="crow-expanded"
         data-swipe-detect data-swipe-action="crow-zone" data-swipe-axis="y" data-swipe-threshold="40">
      <div class="crow-figure-slot"></div>
      <div class="crow-speech">
        <div class="crow-bubble" id="crow-bubble" data-priority="normal">
          <div class="crow-bubble-head">
            <span class="crow-bubble-title" id="crow-title"></span>
            <span class="crow-bubble-meta">${icons.sun}<span id="crow-date"></span></span>
          </div>
          <div class="crow-bubble-text" id="crow-text"></div>
          <div class="crow-bubble-time" id="crow-time"></div>
        </div>
        <div class="chips-wrap">
          <button class="chips-arrow chips-arrow-left" id="chips-left" data-action="scroll-chips" data-dir="-1" aria-label="Лівіше">‹</button>
          <div class="chips" id="crow-chips"></div>
          <button class="chips-arrow chips-arrow-right" id="chips-right" data-action="scroll-chips" data-dir="1" aria-label="Правіше">›</button>
        </div>
      </div>
    </div>
    <button class="crow-collapsed" data-action="expand-crow" aria-label="Розгорнути Crow">
      <span class="crow-collapsed-figure"></span>
      <span class="crow-collapsed-text" id="crow-collapsed-text"></span>
      <span class="crow-collapsed-caret">${icons.chevronDown}</span>
    </button>`

  $('.crow-figure-slot', root)?.replaceWith(character.node)
  $('.crow-collapsed-figure', root)?.replaceWith(CrowCharacter.miniature())

  const strip = $('#crow-chips', root)
  const left = $('#chips-left', root)
  const right = $('#chips-right', root)
  if (strip && left && right) {
    strip.addEventListener('scroll', () => updateChipArrows(strip, left, right), { passive: true })
  }

  // Swipe up collapses; swipe down expands, exactly as the donor's board does.
  regTouch('crow-zone', (_data, delta) => {
    if (delta < -40) setZoneState('collapsed')
    else if (delta > 40) setZoneState('expanded')
  })

  reg('expand-crow', () => setZoneState('expanded'))
  reg('scroll-chips', (data) => {
    const el = $('#crow-chips')
    if (!el) return
    el.scrollBy({ left: (data.dir === '1' ? 1 : -1) * 130, behavior: 'smooth' })
  })

  const today = new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
  const date = $('#crow-date', root)
  if (date) date.textContent = today
}

export function getZoneState(): ZoneState { return state }

export function setZoneState(next: ZoneState): void {
  if (!zone || state === next) return
  state = next
  zone.dataset.state = next
  // The screen's top edge follows the zone, so content gains the space instead
  // of the collapsed zone leaving a hole above it.
  document.documentElement.style.setProperty(
    '--shell-top',
    next === 'collapsed'
      ? 'calc(var(--topbar-h) + 64px)'
      : 'calc(var(--topbar-h) + var(--crow-h))',
  )
}

export function showMessage(msg: BoardMessage): void {
  if (!zone) return
  current = msg

  const bubble = $('#crow-bubble', zone)
  const title = $('#crow-title', zone)
  const text = $('#crow-text', zone)
  const collapsed = $('#crow-collapsed-text', zone)
  if (bubble) bubble.dataset.priority = msg.priority
  if (title) title.textContent = msg.title
  if (collapsed) collapsed.textContent = msg.text.replace(/\n+/g, ' ')

  // Cross-fade rather than a hard swap: the first message appears instantly,
  // later ones fade so the zone does not blink on every module change.
  if (text) {
    if (!text.textContent) {
      text.textContent = msg.text
    } else if (text.textContent !== msg.text) {
      text.classList.add('is-fading')
      setTimeout(() => {
        text.textContent = msg.text
        text.classList.remove('is-fading')
      }, FADE_MS)
    }
  }

  character?.sayOnce()
  renderBoardChips(msg.chips)
  refreshAge()
}

export function setChips(chips: CrowChip[]): void {
  if (current) current.chips = chips
  renderBoardChips(chips)
}

function renderBoardChips(chips: CrowChip[]): void {
  const strip = $('#crow-chips')
  const left = $('#chips-left')
  const right = $('#chips-right')
  if (!strip) return
  renderChips(strip, chips, handlers)
  if (left && right) setTimeout(() => updateChipArrows(strip, left, right), 50)
}

/**
 * A stale thought says so instead of being hidden.
 *
 * NeverMind's lesson: collapsing the board when a message ages makes the UI
 * jump; a grey "12 хв тому" under it tells the truth and moves nothing.
 */
export function refreshAge(): void {
  const time = $('#crow-time')
  if (!time || !current) return
  const label = relativeTime(current.ts, STALE_AFTER)
  time.textContent = label ? `• ${label}` : ''
}

export function crowSpeaking(on: boolean): void {
  if (on) character?.startTalking()
  else character?.stopTalking()
}

/** Used by the collapsed strip and tests to read what Crow last said. */
export function currentMessage(): BoardMessage | null { return current }

export const _debug = { escapeHtml }
