/** Hiding a module removes it from the bar and nothing else. */
import { expect, test } from '@playwright/test'
import { gotoModule, swipeY } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await expect(page.locator('#screen-control')).toHaveClass(/active/)
})

test('the modules sheet opens and Control cannot be switched off', async ({ page }) => {
  await page.locator('[data-action="open-modules"]').tap()
  await expect(page.locator('.sheet')).toHaveClass(/open/)
  const control = page.locator('.mod-card[data-id="control"]')
  await expect(control.locator('.mod-card-locked')).toHaveText('ЗАВЖДИ')
  await expect(control).not.toHaveAttribute('data-action', 'toggle-module')
  // «Готово» is in the head, next to the title — NeverMind's placement.
  await expect(page.locator('.sheet-head [data-action="apply-modules"]')).toHaveText('Готово')
  // Control is pinned first in the order strip, with no ‹ › to tap.
  const first = page.locator('.mod-order-item').first()
  await expect(first).toHaveClass(/locked/)
  await expect(first).toContainText('Control')
  await expect(first).not.toHaveAttribute('data-action', 'pick-order')
})

test('a module can be switched on, and it survives a reload', async ({ page }) => {
  await expect(page.locator('.tab-item[data-tab="memory"]')).toHaveCount(0)

  await page.locator('[data-action="open-modules"]').tap()
  await page.locator('.mod-card[data-id="memory"]').tap()
  await page.locator('[data-action="apply-modules"]').tap()
  await expect(page.locator('.tab-item[data-tab="memory"]')).toHaveCount(1)

  await page.reload()
  await expect(page.locator('.tab-item[data-tab="memory"]')).toHaveCount(1)
})

test('a module switched on takes its registry place, not the end', async ({ page }) => {
  // Registry order is control, work, agents, projects, memory, events; memory is
  // off by default. NeverMind re-sorts on switch-on, so it lands before events.
  await page.locator('[data-action="open-modules"]').tap()
  await page.locator('.mod-card[data-id="memory"]').tap()
  const strip = await page.locator('.mod-order-name').allTextContents()
  expect(strip).toEqual(['Control', 'Задачі', 'Агенти', 'Проєкти', 'Памʼять', 'Події'])

  await page.locator('[data-action="apply-modules"]').tap()
  const order = await page.locator('.tab-item').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.tab))
  expect(order).toEqual(['control', 'work', 'agents', 'projects', 'memory', 'events'])
})

test('a hidden module leaves the bar but keeps its data', async ({ page }) => {
  await gotoModule(page, 'events')
  await expect(page.getByText('Нічний бекап GBrain')).toBeVisible()

  await page.locator('[data-action="open-modules"]').tap()
  await page.locator('.mod-card[data-id="events"]').tap()
  await page.locator('[data-action="apply-modules"]').tap()

  await expect(page.locator('.tab-item[data-tab="events"]')).toHaveCount(0)
  await expect(page.locator('#screen-control')).toHaveClass(/active/)

  // Switch it back on: the feed is exactly as it was.
  await page.locator('[data-action="open-modules"]').tap()
  await page.locator('.mod-card[data-id="events"]').tap()
  await page.locator('[data-action="apply-modules"]').tap()
  await gotoModule(page, 'events')
  await expect(page.getByText('Нічний бекап GBrain')).toBeVisible()
})

test('the sheet closes by tapping the backdrop', async ({ page }) => {
  await page.locator('[data-action="open-modules"]').tap()
  await expect(page.locator('.sheet')).toBeVisible()
  await page.locator('#modules-sheet').tap({ position: { x: 195, y: 60 } })
  await expect(page.locator('.sheet')).toHaveCount(0)
})

test('the sheet closes by swiping the card down', async ({ page }) => {
  await page.locator('[data-action="open-modules"]').tap()
  await expect(page.locator('.sheet')).toHaveClass(/open/)
  const box = await page.locator('.sheet').boundingBox()
  expect(box).not.toBeNull()
  const top = (box as { y: number }).y
  // 80px is the donor's commit distance; 200px is well past it.
  await swipeY(page, '.sheet', top + 20, top + 220)
  await expect(page.locator('.sheet')).toHaveCount(0)
})

test('a sideways swipe on the order strip does not drag the sheet', async ({ page }) => {
  await page.locator('[data-action="open-modules"]').tap()
  await expect(page.locator('.sheet')).toHaveClass(/open/)
  // More horizontal than vertical: the donor's B-138 guard leaves the card alone.
  await page.locator('.mod-order').evaluate((el) => {
    const fire = (type: string, x: number, y: number) => {
      const t = { identifier: 1, target: el, clientX: x, clientY: y }
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [t] })
      Object.defineProperty(ev, 'changedTouches', { value: [t] })
      el.dispatchEvent(ev)
    }
    fire('touchstart', 300, 700)
    fire('touchmove', 200, 730)
    fire('touchmove', 100, 760)
    fire('touchend', 100, 760)
  })
  await page.waitForTimeout(450)
  await expect(page.locator('.sheet')).toHaveCount(1)
  // Chromium serialises translateY(0) as translateY(0px); either means "not moved".
  const transform = await page.locator('.sheet').evaluate((el) => (el as HTMLElement).style.transform)
  expect(transform).toMatch(/^translateY\(0(px)?\)$/)
})

test('the order of modules can be changed and it sticks', async ({ page }) => {
  await page.locator('[data-action="open-modules"]').tap()
  // The arrows appear only next to the chip that was tapped.
  await expect(page.locator('[data-action="move-order"]')).toHaveCount(0)
  await page.locator('.mod-order-item', { hasText: 'Події' }).tap()
  await expect(page.locator('[data-action="move-order"]')).toHaveCount(2)
  await page.locator('[data-action="move-order"][data-dir="-1"]').tap()
  await page.locator('[data-action="apply-modules"]').tap()

  const order = await page.locator('.tab-item').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.tab))
  expect(order.indexOf('events')).toBeLessThan(order.indexOf('projects'))

  await page.reload()
  const afterReload = await page.locator('.tab-item').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.tab))
  expect(afterReload).toEqual(order)
})

test('nothing can be moved in front of Control', async ({ page }) => {
  await page.locator('[data-action="open-modules"]').tap()
  await page.locator('.mod-order-item', { hasText: 'Задачі' }).tap()
  // Second in the strip: ‹ would put it before Control, so it is greyed out.
  await expect(page.locator('[data-action="move-order"][data-dir="-1"]')).toBeDisabled()
  await expect(page.locator('[data-action="move-order"][data-dir="1"]')).toBeEnabled()

  await page.locator('[data-action="move-order"][data-dir="1"]').tap()
  const strip = await page.locator('.mod-order-name').allTextContents()
  expect(strip).toEqual(['Control', 'Агенти', 'Задачі', 'Проєкти', 'Події'])
})
