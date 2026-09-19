/**
 * Keyboard avoidance on iOS.
 *
 * Ported from NeverMind's `setupKeyboardAvoiding`, threshold and all. The 250px
 * is the whole trick: Safari hiding its own toolbar shrinks the visual viewport
 * by a hundred-ish pixels, and treating that as a keyboard makes the bar drop
 * away while you are only scrolling. Above 250px it is a real keyboard.
 *
 * The retries are not superstition either — iOS does not send a resize when a
 * field is refocused and the viewport is already in position, and after a
 * return from the background it settles over roughly half a second.
 */
import { collapseToA, getChatState, resizeToState } from './chat.js'

const KEYBOARD_THRESHOLD = 250

export function setupKeyboardAvoiding(): void {
  if (!window.visualViewport) return

  const update = (): void => {
    const vv = window.visualViewport
    if (!vv) return
    // Deliberately NOT including vv.offsetTop: it grows as the page scrolls,
    // which would make the height read below the threshold and leave the bar up.
    const keyboard = Math.max(0, window.innerHeight - vv.height)
    const dock = document.getElementById('crow-dock')
    const tabBar = document.getElementById('tab-bar')
    const tabHeight = tabBar?.offsetHeight ?? 78

    if (keyboard > KEYBOARD_THRESHOLD) {
      if (dock) dock.style.bottom = `${keyboard + 8}px`
      if (tabBar) {
        // Far enough to clear the screen entirely, not just far enough to look gone.
        tabBar.style.transform = `translateY(${tabHeight + keyboard}px)`
        tabBar.style.opacity = '0'
        tabBar.style.pointerEvents = 'none'
      }
      // Full-screen chat cannot survive the keyboard; drop to compact.
      if (getChatState() === 'b') collapseToA()
      else resizeToState()
    } else {
      if (dock) dock.style.bottom = `calc(var(--tabbar-h) + 4px)`
      if (tabBar) {
        tabBar.style.transform = 'translateY(0)'
        tabBar.style.opacity = ''
        tabBar.style.pointerEvents = ''
      }
      resizeToState()
    }
  }

  window.visualViewport.addEventListener('resize', update)
  window.visualViewport.addEventListener('scroll', update)

  // Coming back from the background: the viewport is unstable for ~600ms.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    setTimeout(update, 80)
    setTimeout(update, 350)
    setTimeout(update, 750)
  })

  // Refocusing an already-focused field produces no resize event at all.
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement | null
    if (!t || !(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return
    setTimeout(update, 120)
    setTimeout(update, 400)
  }, { passive: true })

  document.addEventListener('focusout', (e) => {
    const t = e.target as HTMLElement | null
    if (!t || !(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return
    setTimeout(update, 150)
  }, { passive: true })
}
