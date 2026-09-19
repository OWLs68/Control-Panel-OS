/** Shared gestures. Playwright has no swipe, so these dispatch real touch events. */
import { expect, type Page } from '@playwright/test'

/** A vertical swipe on `selector`, from one y to another. */
export async function swipeY(page: Page, selector: string, fromY: number, toY: number): Promise<void> {
  await page.locator(selector).evaluate((el, [y1, y2]) => {
    const touch = (y: number) => new Touch({ identifier: 1, target: el, clientX: 200, clientY: y })
    const ev = (type: string, y: number) => new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [touch(y)],
      changedTouches: [touch(y)],
    })
    el.dispatchEvent(ev('touchstart', y1 as number))
    el.dispatchEvent(ev('touchmove', ((y1 as number) + (y2 as number)) / 2))
    el.dispatchEvent(ev('touchmove', y2 as number))
    el.dispatchEvent(ev('touchend', y2 as number))
  }, [fromY, toY])
  await page.waitForTimeout(450)
}

/** A horizontal drag across the drum, as a finger would do it. */
export async function swipeDrum(page: Page, dx: number): Promise<void> {
  await page.locator('#drum').evaluate((el, delta) => {
    const box = el.getBoundingClientRect()
    const y = box.top + box.height / 2
    const from = box.left + box.width / 2
    const touch = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
    const ev = (type: string, x: number) => new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [touch(x)],
      changedTouches: [touch(x)],
    })
    el.dispatchEvent(ev('touchstart', from))
    for (let i = 1; i <= 4; i++) el.dispatchEvent(ev('touchmove', from + ((delta as number) * i) / 4))
    el.dispatchEvent(ev('touchend', from + (delta as number)))
  }, dx)
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
