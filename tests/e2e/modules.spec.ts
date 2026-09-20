/** Hiding a module removes it from the bar and nothing else. */
import { expect, test } from '@playwright/test'
import { gotoModule } from './helpers.js'

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

test('the order of modules can be changed and it sticks', async ({ page }) => {
  await page.locator('[data-action="open-modules"]').tap()
  await page.locator('.mod-order-item', { hasText: 'Події' }).tap()
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
