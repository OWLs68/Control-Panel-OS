/**
 * Boot.
 *
 * Order matters and is not cosmetic: measurements before the first render so
 * nothing paints at the wrong height, delegation before any screen exists so
 * the first tap is already live, fixtures before the shell so the first screen
 * has something to draw.
 *
 * The service-worker registration is deliberately careful. Every line in it
 * answers a specific iOS behaviour — bfcache restoring a stale page, a reload
 * that should take the new worker, standalone mode keeping an old bundle — and
 * "tidying" it is how a phone ends up pinned to a build from last week.
 */
import { initDelegation } from './delegation.js'
import { initTouchDetect } from './touch.js'
import { seedFixtures } from '../data/seed.js'
import { setupShell } from '../nav/shell.js'
import { setupKeyboardAvoiding } from '../crow/keyboard.js'
import { setupVoiceInput } from '../crow/voice.js'
import { registerControl } from '../modules/control.js'
import { registerAgents } from '../modules/agents.js'
import { registerProjects } from '../modules/projects.js'
import { registerMemory } from '../modules/memory.js'
import { registerEvents } from '../modules/events.js'

export function boot(): void {
  registerModules()
  seedFixtures()

  initDelegation()
  initTouchDetect()

  // Measure once for a sane first paint, then again after the shell has filled
  // the bars — an empty drum measures ~15px, and every screen's bottom padding
  // is computed from that number.
  measureChrome()
  setupShell()
  measureChrome()
  requestAnimationFrame(() => {
    measureChrome()
    // Announce that the layout has settled. During the first frames the drum's
    // track is briefly wider than the screen, before its padding is computed —
    // harmless to look at, but anything measuring the app should wait for this.
    document.body.dataset.ready = '1'
  })

  setupKeyboardAvoiding()
  setupVoiceInput()

  // Web fonts change the bars' height when they land, so measure once more.
  if (document.fonts?.ready) void document.fonts.ready.then(measureChrome)

  // NeverMind (boot.js:484–500) measures once more 500ms in, as a fallback.
  // ISS-002 is what happens without it: on the phone the bar grows after the
  // last measurement — the safe-area inset and the font swap both land late —
  // and the input box ends up under the drum. The observer below catches any
  // later change as well; the timer stays because it is the donor's own net.
  setTimeout(measureChrome, 500)
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(measureChrome)
    for (const id of ['tab-bar', 'topbar', 'crow-input-box', 'crow-zone']) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
  }

  window.addEventListener('resize', measureChrome)
  window.addEventListener('orientationchange', () => setTimeout(measureChrome, 120))

  registerServiceWorker()
}

/** One registry entry per module — adding a sixth is one call here. */
function registerModules(): void {
  registerControl()
  registerAgents()
  registerProjects()
  registerMemory()
  registerEvents()
}

/**
 * The bar and the top bar are measured, not assumed.
 *
 * NeverMind writes its real height into `--tabbar-h` for exactly this reason:
 * a hard-coded 83px is wrong on every device that is not the one it was typed
 * on, and the screen's bottom padding is computed from it.
 */
function measureChrome(): void {
  const root = document.documentElement
  const tabBar = document.getElementById('tab-bar')
  const topBar = document.getElementById('topbar')
  // The dock is the visible input box, not the whole bar. The chat window
  // lives inside the bar too, hidden by a transform rather than display:none,
  // so the bar measures ~427px with the chat closed and every screen got a
  // 514px bottom padding (ISS-003). The +4 is the gap the bar keeps above the
  // drum (`bottom: --tabbar-h + 4px`).
  const dock = document.getElementById('crow-input-box')
  // The Crow zone is as tall as its content, so it is measured like a bar and
  // the screens start under it.
  const zone = document.getElementById('crow-zone')

  if (tabBar?.offsetHeight) root.style.setProperty('--tabbar-h', `${tabBar.offsetHeight}px`)
  if (topBar?.offsetHeight) root.style.setProperty('--topbar-h', `${topBar.offsetHeight}px`)
  if (dock?.offsetHeight) root.style.setProperty('--dock-h', `${dock.offsetHeight + 4}px`)
  if (zone?.offsetHeight) root.style.setProperty('--crow-h', `${zone.offsetHeight}px`)
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  // file:// has no worker scope; the app is also opened straight from disk
  // during development and a failed registration should not be noise.
  if (location.protocol === 'file:') return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // A reload should mean "give me the new one", not "serve whatever is cached".
      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        if (!next) return
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            next.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })
    }).catch(() => { /* offline first run; the app still works */ })

    // iOS restores a page from bfcache without re-running boot, so an update
    // that landed while the app was backgrounded is picked up here.
    window.addEventListener('pageshow', (e) => {
      if ((e as PageTransitionEvent).persisted) navigator.serviceWorker.getRegistration().then((r) => r?.update())
    })
  })
}
