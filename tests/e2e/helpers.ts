/**
 * Shared gestures.
 *
 * Playwright has no swipe primitive, so these dispatch touch events by hand.
 * The awkward part is that the `Touch` constructor is a Chromium/Firefox
 * feature — WebKit throws `Illegal constructor`, which silently meant the swipe
 * specs were only ever testing Chromium. So the event is built with whatever
 * the engine actually provides, falling back to a plain Event carrying
 * `touches` and `changedTouches`: the app's handlers read clientX/clientY off
 * those two lists and nothing else, so a duck-typed event drives the same code.
 *
 * What this does NOT prove is that the browser's real touch pipeline behaves —
 * passive listeners, scroll contention, momentum. That still needs a phone.
 */
import { expect, type Page } from '@playwright/test'

interface Point { x: number; y: number }

async function touchSequence(page: Page, selector: string, points: Point[]): Promise<void> {
  await page.locator(selector).evaluate((el, steps) => {
    const makeTouch = (p: Point, i: number): unknown => {
      // Chromium and Firefox have the constructor; WebKit has createTouch; if
      // neither works, a plain object is enough for handlers that only read
      // coordinates off the list.
      try {
        return new Touch({ identifier: i + 1, target: el, clientX: p.x, clientY: p.y })
      } catch { /* not this engine */ }
      const legacy = document as Document & {
        createTouch?: (v: Window, t: Element, id: number, px: number, py: number, sx: number, sy: number) => unknown
      }
      if (typeof legacy.createTouch === 'function') {
        return legacy.createTouch(window, el, i + 1, p.x, p.y, p.x, p.y)
      }
      return { identifier: i + 1, target: el, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y }
    }

    const fire = (type: string, at: Point) => {
      const list = [makeTouch(at, 0)]
      const active = type === 'touchend' ? [] : list
      let ev: Event
      try {
        ev = new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: active as Touch[], changedTouches: list as Touch[],
        })
      } catch {
        ev = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperty(ev, 'touches', { value: active })
        Object.defineProperty(ev, 'changedTouches', { value: list })
      }
      el.dispatchEvent(ev)
    }

    const path = steps as Point[]
    fire('touchstart', path[0] as Point)
    for (const step of path.slice(1)) fire('touchmove', step)
    fire('touchend', path[path.length - 1] as Point)
  }, points)
}

/** A vertical swipe on `selector`, from one y to another. */
export async function swipeY(page: Page, selector: string, fromY: number, toY: number): Promise<void> {
  await touchSequence(page, selector, [
    { x: 200, y: fromY },
    { x: 200, y: (fromY + toY) / 2 },
    { x: 200, y: toY },
  ])
  await page.waitForTimeout(450)
}

/** A horizontal drag across the drum, as a finger would do it. */
export async function swipeDrum(page: Page, dx: number): Promise<void> {
  const box = await page.locator('#drum').boundingBox()
  if (!box) return
  const y = box.y + box.height / 2
  const from = box.x + box.width / 2
  await touchSequence(page, '#drum', [
    { x: from, y },
    { x: from + dx * 0.25, y },
    { x: from + dx * 0.5, y },
    { x: from + dx * 0.75, y },
    { x: from + dx, y },
  ])
  await page.waitForTimeout(650)
}

/**
 * Go to a module the way a person does: if its tab is off the edge of the drum,
 * swipe the drum until it is in reach, then tap it.
 */
export async function gotoModule(page: Page, id: string): Promise<void> {
  const tab = page.locator(`.tab-item[data-tab="${id}"]`)
  await expect(tab).toHaveCount(1)

  for (let attempt = 0; attempt < 6; attempt++) {
    const reachable = await page.evaluate((moduleId) => {
      const drum = document.getElementById('drum')
      const el = document.querySelector(`.tab-item[data-tab="${moduleId}"]`)
      if (!drum || !el) return null
      const d = drum.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const mid = r.left + r.width / 2
      return { inside: r.left >= d.left - 1 && r.right <= d.right + 1, offset: mid - (d.left + d.width / 2) }
    }, id)
    if (!reachable) return
    if (reachable.inside) break
    await swipeDrum(page, reachable.offset > 0 ? -120 : 120)
  }

  await tab.tap()
  await expect(page.locator(`#screen-${id}`)).toHaveClass(/active/)
}
