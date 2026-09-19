/**
 * Crow: the zone, and the single chat with its context envelope.
 *
 * The last test is the one that matters most — it is the control case the whole
 * design is for: stand on a blocker, ask with a pronoun, get an answer about
 * that blocker.
 */
import { expect, test } from '@playwright/test'
import { gotoModule, swipeY } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await expect(page.locator('#screen-control')).toHaveClass(/active/)
})

test('Crow stands full height at the left, tilted, with the bubble to his right', async ({ page }) => {
  const figure = page.locator('.crow-figure')
  await expect(figure).toBeVisible()
  // Measure the laid-out height, not the bounding box: a rotated element's box
  // is taller than the character drawn inside it.
  const height = await figure.evaluate((el) => (el as HTMLElement).offsetHeight)
  expect(height).toBeGreaterThanOrEqual(160)
  expect(height).toBeLessThanOrEqual(180)

  const tilt = await figure.evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform)
    return Math.abs((Math.atan2(m.b, m.a) * 180) / Math.PI)
  })
  expect(tilt).toBeGreaterThanOrEqual(10)
  expect(tilt).toBeLessThanOrEqual(20)

  const figureBox = await figure.boundingBox()
  const bubble = await page.locator('#crow-bubble').boundingBox()
  expect(bubble?.x).toBeGreaterThan(figureBox?.x ?? 0)

  // Full height, not a round avatar: clearly taller than it is wide.
  expect(height).toBeGreaterThan(await figure.evaluate((el) => (el as HTMLElement).offsetWidth))
})

test('chips sit under the bubble and doing one sends it as my own words', async ({ page }) => {
  const chip = page.locator('.chip').first()
  await expect(chip).toBeVisible()
  const label = (await chip.textContent())?.trim() ?? ''

  await chip.tap()
  await expect(page.locator('.msg-user')).toContainText(label)
  await expect(page.locator('.msg-agent')).toBeVisible()
})

test('the zone collapses on a swipe up and comes back', async ({ page }) => {
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'expanded')
  await swipeY(page, '.crow-expanded', 260, 180)
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'collapsed')
  await expect(page.locator('.crow-collapsed')).toBeVisible()

  await page.locator('[data-action="expand-crow"]').tap()
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'expanded')
})

test('collapsing gives the screen its space back', async ({ page }) => {
  const before = await page.locator('#screen-control').boundingBox()
  await swipeY(page, '.crow-expanded', 260, 180)
  const after = await page.locator('#screen-control').boundingBox()
  expect(after?.height ?? 0).toBeGreaterThan(before?.height ?? 0)
})

test('the input is present on every module', async ({ page }) => {
  for (const id of ['control', 'agents', 'projects', 'events']) {
    await gotoModule(page, id)
    await expect(page.locator('#chat-input')).toBeVisible()
  }
})

test('the chat opens compact, expands to full, and closes', async ({ page }) => {
  const win = page.locator('#chat-window')
  await expect(win).not.toHaveClass(/open/)

  await page.locator('#chat-input').tap()
  await expect(win).toHaveClass(/open/)
  // Wait for the open animation before measuring, or the height read is a frame
  // somewhere in the middle of it.
  await page.waitForTimeout(500)
  const compact = (await win.boundingBox())?.height ?? 0
  expect(compact).toBeGreaterThan(150)

  await swipeY(page, '#chat-handle', 300, 180)    // up: compact → full
  await page.waitForTimeout(500)
  const full = (await win.boundingBox())?.height ?? 0
  expect(full).toBeGreaterThan(compact)

  await swipeY(page, '#chat-handle', 180, 340)    // down: full → compact
  await page.waitForTimeout(500)
  const backToCompact = (await win.boundingBox())?.height ?? 0
  expect(backToCompact).toBeLessThan(full)
})

test('one conversation: it survives moving between modules', async ({ page }) => {
  await page.locator('#chat-input').fill('перевірка памʼяті чату')
  await page.locator('[data-action="send-crow"]').tap()
  await expect(page.locator('.msg-user')).toContainText('перевірка памʼяті чату')
  await expect(page.locator('.msg-agent')).toBeVisible()

  await gotoModule(page, 'agents')
  await expect(page.locator('#chat-window')).toHaveClass(/open/)
  await expect(page.locator('.msg-user')).toContainText('перевірка памʼяті чату')
})

test('closing the chat does not wipe what I was typing', async ({ page }) => {
  await page.locator('#chat-input').fill('недописана думка')
  await swipeY(page, '#chat-handle', 200, 340)   // swipe down closes
  await gotoModule(page, 'projects')
  await expect(page.locator('#chat-input')).toHaveValue('недописана думка')
})

test('Crow greets each module in its own words', async ({ page }) => {
  await expect(page.locator('#crow-title')).toHaveText('Привіт!')
  await gotoModule(page, 'agents')
  await expect(page.locator('#crow-title')).toHaveText('Агенти')
  await gotoModule(page, 'projects')
  await expect(page.locator('#crow-title')).toHaveText('Проєкти')
})

test('THE CONTROL CASE: ask about a blocker with a pronoun and Crow knows which one', async ({ page }) => {
  await gotoModule(page, 'projects')
  await page.locator('[data-action="toggle-blocker"]').first().tap()

  // The envelope is visible to Roman too, so it is checkable rather than magic.
  await page.locator('#chat-input').tap()
  await expect(page.locator('#chat-context')).toContainText('Окремі ключі для клієнтів')

  await page.locator('#chat-input').fill('А чого це заблоковано?')
  await page.locator('[data-action="send-crow"]').tap()

  const reply = page.locator('.msg-agent').last()
  await expect(reply).toContainText('Окремі ключі для клієнтів')
  await expect(reply).toContainText('Roman AI OS / GBrain')
  await expect(reply).toContainText('Чекає на: Роман')
})

test('one object, one id: the same blocker reached from Control', async ({ page }) => {
  // Tap it in the "потребує мене" list on Control, not in Crow's bubble.
  await page.locator('[data-action="open-attention"]', { hasText: 'Окремі ключі для клієнтів' }).tap()
  await expect(page.locator('#screen-projects')).toHaveClass(/active/)
  await expect(page.locator('#chat-context')).toContainText('Окремі ключі для клієнтів')

  await page.locator('#chat-input').fill('Чому?')
  await page.locator('[data-action="send-crow"]').tap()
  await expect(page.locator('.msg-agent').last()).toContainText('Hermes і Claude ділять один токен')
})

test('the source of every number is stated on screen', async ({ page }) => {
  await expect(page.locator('.source-tag').first()).toHaveText('демо')
  await expect(page.locator('.source-tag').first()).toHaveAttribute('data-origin', 'mock')
})
