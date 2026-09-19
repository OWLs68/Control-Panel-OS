/**
 * The shell: screens, module switching, and the wiring between the drum, the
 * Crow zone and the one chat.
 *
 * Switching a module re-renders its screen and gives Crow a new line to say —
 * but it does NOT touch the conversation. That is the difference from the
 * donor, where changing tab closes every chat and drops the draft.
 */
import { $, $$ } from '../core/dom.js'
import { reg } from '../core/delegation.js'
import { onDataChanged, UI_CONTEXT_CHANGED } from '../core/events.js'
import { getActiveModuleId, setActiveModule, setSelection } from '../core/selection.js'
import { allModules, getModule, HOME_MODULE_ID } from '../modules/registry.js'
import { navigate, NAVIGATE, type NavigateRequest } from '../modules/navigate.js'
import { REFRESH } from '../modules/refresh.js'
import { getEnabledModuleIds } from './module-state.js'
import { rebuildDrum, setupDrum, updateDrum } from './drum.js'
import { openModuleSheet } from './module-sheet.js'
import { setupCrowZone, showMessage, refreshAge } from '../crow/board.js'
import { openChat, sendText, setupChat, updateContextLine } from '../crow/chat.js'
import type { ChipHandlers } from '../crow/chips.js'

const AGE_TICK_MS = 60_000

const chipHandlers: ChipHandlers = {
  onChat: (label) => { openChat('a'); sendText(label) },
  onNav: (moduleId) => switchModule(moduleId),
  onOpen: (id, label) => {
    navigate({ moduleId: 'projects', select: { entity: 'blocker', id, label } })
  },
}

export function setupShell(): void {
  const screens = $('#screens')
  const zone = $('#crow-zone')
  const dock = $('#crow-dock')
  const bar = $('#tab-bar')
  if (!screens || !zone || !dock || !bar) throw new Error('shell markup missing')

  // One .screen per registered module, including the hidden ones: hiding a
  // module takes it out of the bar, not out of the system, so its screen has to
  // stay reachable by a chip or a deep link.
  screens.innerHTML = allModules()
    .map((m) => `<section class="screen" id="screen-${m.id}" data-module="${m.id}"></section>`)
    .join('')

  setupCrowZone(zone, chipHandlers)
  setupChat(dock, chipHandlers)
  setupDrum(bar, (id) => switchModule(id))

  reg('open-modules', () => {
    openModuleSheet((ids) => {
      rebuildDrum(getActiveModuleId())
      // If the module you were standing on has just been hidden, land on home
      // rather than leave the user on a screen with no way back to it.
      if (!ids.includes(getActiveModuleId())) switchModule(HOME_MODULE_ID)
    })
  })

  window.addEventListener(NAVIGATE, (e) => {
    const req = (e as CustomEvent<NavigateRequest>).detail
    // Order matters: switching module clears the selection by design (whatever
    // was open is no longer on screen), so the incoming selection has to be set
    // AFTER the switch or it is wiped before anyone sees it.
    switchModule(req.moduleId, true)
    if (req.select) {
      setSelection(req.select)
      renderModule(req.moduleId)
      updateContextLine()
    }
  })

  window.addEventListener(REFRESH, () => {
    renderModule(getActiveModuleId())
    updateContextLine()
  })

  window.addEventListener(UI_CONTEXT_CHANGED, () => updateContextLine())
  onDataChanged(() => renderModule(getActiveModuleId()))

  // A stale thought should start saying how old it is without a tab change.
  setInterval(refreshAge, AGE_TICK_MS)

  rebuildDrum(HOME_MODULE_ID)
  switchModule(HOME_MODULE_ID, true)
}

export function switchModule(id: string, force = false): void {
  const mod = getModule(id)
  if (!mod) return
  const previous = getActiveModuleId()
  if (previous === id && !force) return

  const order = getEnabledModuleIds()
  const direction = order.indexOf(id) >= order.indexOf(previous) ? 'right' : 'left'

  setActiveModule(id)
  renderModule(id)

  $$('.screen').forEach((s) => {
    s.classList.remove('active', 'slide-from-right', 'slide-from-left')
  })
  const screen = $(`#screen-${id}`)
  if (screen) {
    screen.classList.add('active', direction === 'right' ? 'slide-from-right' : 'slide-from-left')
    screen.scrollTop = 0
  }

  updateDrum(id)
  greet(mod.id)
  updateContextLine()
}

function renderModule(id: string): void {
  const mod = getModule(id)
  const screen = $(`#screen-${id}`)
  if (!mod || !screen) return
  mod.render(screen)
}

function greet(id: string): void {
  const mod = getModule(id)
  if (!mod) return
  const g = mod.greeting()
  showMessage({ title: g.title, text: g.text, priority: g.priority, chips: g.chips, ts: Date.now() })
}
