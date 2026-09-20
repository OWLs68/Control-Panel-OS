/**
 * Settings — NeverMind's panel as a card modal, with Roma OS's own rows.
 *
 * Assertions are about the screen: the card is open, the row says the number,
 * the microphone is gone — not about what sits in storage.
 */
import { expect, test, type Page } from '@playwright/test'
import { gotoModule, swipeY } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
})

/** Open, and wait for the donor's 0.35s pop-in to land at scale(1). */
async function openSettings(page: Page): Promise<void> {
  await page.locator('[data-action="open-settings"]').tap()
  const card = page.locator('#settings-modal .modal-card')
  await expect(card).toHaveClass(/open/)
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)')
}

test('the gear replaces the magnifier and opens the settings card', async ({ page }) => {
  await expect(page.locator('[data-action="open-search"]')).toHaveCount(0)
  await openSettings(page)
  const card = page.locator('#settings-modal .modal-card')
  await expect(card.locator('.settings-title')).toHaveText('Налаштування')
  await expect(card.locator('.settings-version')).toHaveText(/^Roma OS · v(dev|\d+)$/)
  // The dim layer is a top-level sibling of the modal, never a child.
  await expect(page.locator('body > #settings-modal-dim')).toHaveCount(1)
  await expect(page.locator('#settings-modal .modal-dim')).toHaveCount(0)
  // The card sits 16px in from the sides and the bottom, as in the donor.
  const box = await card.boundingBox()
  const vw = await page.evaluate(() => window.innerWidth)
  const vh = await page.evaluate(() => window.innerHeight)
  expect(box?.x).toBe(16)
  expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(vw - 16)
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(vh - 16)
  // Tap the backdrop: the donor's `event.target === this`, gone after 300ms.
  await page.locator('#settings-modal').tap({ position: { x: 20, y: 20 } })
  await expect(page.locator('#settings-modal')).toHaveCount(0)
  await expect(page.locator('#settings-modal-dim')).toHaveCount(0)
})

test('«Модулі в барабані» closes the settings and opens the modules sheet', async ({ page }) => {
  await openSettings(page)
  await page.locator('[data-action="settings-modules"]').tap()
  await expect(page.locator('#settings-modal')).toHaveCount(0)
  await expect(page.locator('#modules-sheet .sheet')).toHaveClass(/open/)
  await expect(page.locator('.sheet-head [data-action="apply-modules"]')).toHaveText('Готово')
})

test('the voice switch hides the microphone and remembers it', async ({ page }) => {
  await openSettings(page)
  const row = page.locator('[data-action="settings-voice"]')
  test.skip(await row.isDisabled(), 'no Speech API in this engine — the row says so and stays off')

  await expect(row).toHaveAttribute('aria-checked', 'true')
  await expect(row.locator('.s-toggle')).toHaveClass(/on/)
  await expect(page.locator('#crow-mic-btn')).toBeVisible()

  await row.tap()
  await expect(row).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('#crow-mic-btn')).toBeHidden()

  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await expect(page.locator('#crow-mic-btn')).toBeHidden()

  await openSettings(page)
  await expect(page.locator('[data-action="settings-voice"]')).toHaveAttribute('aria-checked', 'false')
  await page.locator('[data-action="settings-voice"]').tap()
  await expect(page.locator('#crow-mic-btn')).toBeVisible()
})

test('«Очистити історію чату» empties the window and the count', async ({ page }) => {
  // Two turns saved from an earlier visit.
  await page.evaluate(() => localStorage.setItem('roma_chat', JSON.stringify([
    { role: 'user', text: 'Що по проєктах?', ts: Date.now() - 60_000 },
    { role: 'agent', text: 'Два активні.', ts: Date.now() - 59_000 },
  ])))
  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await expect(page.locator('#crow-chat-messages .msg-bubble')).toHaveCount(2)
  await expect(page.locator('#crow-chat-messages .msg-sep-history')).toHaveCount(1)

  await openSettings(page)
  const row = page.locator('[data-action="settings-clear-chat"]')
  await expect(row.locator('.s-row-sub')).toHaveText('2 повідомлення')
  await row.tap()
  await expect(page.locator('[data-action="settings-clear-chat"] .s-row-sub')).toHaveText('Порожньо')
  // Only the greeting is left, and no «Попередня розмова» divider.
  await expect(page.locator('#crow-chat-messages .msg-bubble')).toHaveCount(1)
  await expect(page.locator('#crow-chat-messages .msg-sep-history')).toHaveCount(0)

  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await expect(page.locator('#crow-chat-messages .msg-bubble')).toHaveCount(1)
})

test('«Скинути демо-дані» brings the fixtures back', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('roma_projects', '[]'))
  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await gotoModule(page, 'projects')
  await expect(page.locator('#screen-projects').getByText('Міграція памʼяті')).toHaveCount(0)

  await openSettings(page)
  await page.locator('[data-action="settings-reset-demo"]').tap()
  await page.locator('#settings-modal').tap({ position: { x: 20, y: 20 } })
  await expect(page.locator('#settings-modal')).toHaveCount(0)
  await expect(page.locator('#screen-projects').getByText('Міграція памʼяті').first()).toBeVisible()
})

test('the deploy row opens the deploy info, and the refresh row is there', async ({ page }) => {
  await openSettings(page)
  await expect(page.locator('[data-action="settings-refresh"]')).toContainText('Оновити застосунок')
  await expect(page.locator('[data-action="settings-deploy-info"] .s-value')).toHaveText(/^v(dev|\d+)/)
  await page.locator('[data-action="settings-deploy-info"]').tap()
  await expect(page.locator('#settings-modal')).toHaveCount(0)
  await expect(page.locator('#deploy-info .sheet')).toHaveClass(/open/)
  await expect(page.locator('#deploy-info')).toContainText('Версія')
})

test('a swipe down from the handle closes the card; a swipe inside the list does not', async ({ page }) => {
  await openSettings(page)
  // Inside the scroller a drag is never a close — the donor blocks .settings-scroll.
  await swipeY(page, '#settings-modal .modal-scroll', 400, 600)
  await expect(page.locator('#settings-modal .modal-card')).toHaveClass(/open/)
  await expect(page.locator('#settings-modal')).toHaveCount(1)
  // From the handle, 120px down commits: 0.25s out, then the donor's close.
  await swipeY(page, '#settings-modal .settings-handle', 300, 420)
  await expect(page.locator('#settings-modal')).toHaveCount(0)
})

test('every settings row is a full-width target at least 52px tall', async ({ page }) => {
  await openSettings(page)
  const small = await page.locator('#settings-modal .s-row').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).filter((r) => r.height < 52 || r.width < 300).length)
  expect(small).toBe(0)
})
