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

test('Crow stands beside the bubble at the bubble\'s height, tilted a little', async ({ page }) => {
  const figure = page.locator('.crow-figure')
  await expect(figure).toBeVisible()

  // The figure is exactly as tall as the bubble (Roman, 20.09): measure the
  // laid-out heights, not the bounding boxes — a rotated box is taller.
  const sizes = await page.evaluate(() => {
    const f = document.querySelector('.crow-figure') as HTMLElement
    const b = document.querySelector('#crow-bubble') as HTMLElement
    return { fh: f.offsetHeight, fw: f.offsetWidth, bh: b.offsetHeight }
  })
  expect(Math.abs(sizes.fh - sizes.bh)).toBeLessThanOrEqual(2)
  // Full body, not a round avatar: taller than it is wide.
  expect(sizes.fh).toBeGreaterThan(sizes.fw)
  // The slot fits the widest pose at this height, so no pose can shrink or drop.
  expect(sizes.fw).toBeGreaterThanOrEqual(Math.floor(sizes.fh * 568 / 680) - 1)

  const tilt = await figure.evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform)
    return Math.abs((Math.atan2(m.b, m.a) * 180) / Math.PI)
  })
  expect(tilt).toBeGreaterThanOrEqual(5)
  expect(tilt).toBeLessThanOrEqual(20)

  const figureBox = await figure.boundingBox()
  const bubble = await page.locator('#crow-bubble').boundingBox()
  expect(bubble?.x).toBeGreaterThan(figureBox?.x ?? 0)
})

test('chips run under the figure and the bubble, and doing one sends it as my own words', async ({ page }) => {
  const strip = await page.locator('#crow-chips').boundingBox()
  const bubble = await page.locator('#crow-bubble').boundingBox()
  const figure = await page.locator('.crow-figure').boundingBox()
  // Under both: below the bubble, starting where the figure starts, as
  // NeverMind's .owl-chips-wrapper does.
  expect(strip?.y ?? 0).toBeGreaterThanOrEqual((bubble?.y ?? 0) + (bubble?.height ?? 0) - 1)
  expect(strip?.x ?? 0).toBeLessThan(bubble?.x ?? 0)
  expect(strip?.x ?? 0).toBeLessThan((figure?.x ?? 0) + (figure?.width ?? 0))

  const chip = page.locator('#crow-chips .chip').first()
  await expect(chip).toBeVisible()
  const label = (await chip.textContent())?.trim() ?? ''

  await chip.tap()
  await expect(page.locator('.msg-bubble--user')).toContainText(label)
  await expect(page.locator('.msg-bubble--agent').last()).toBeVisible()
})

test('«Поговорити» ends the strip and opens the chat', async ({ page }) => {
  const speak = page.locator('#crow-chips .chip-speak')
  await expect(speak).toHaveText('Поговорити')
  await expect(page.locator('#crow-chips .chip').last()).toHaveClass(/chip-speak/)
  await speak.tap()
  await expect(page.locator('#crow-chat-window')).toHaveClass(/open/)
})

test('the zone collapses on a swipe up, keeps its chips, and comes back', async ({ page }) => {
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'expanded')
  await swipeY(page, '.crow-expanded', 260, 180)
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'collapsed')
  await expect(page.locator('.crow-collapsed')).toBeVisible()
  // NeverMind keeps the chips in both states; so do we.
  await expect(page.locator('#crow-chips .chip').first()).toBeVisible()

  // The collapsed strip has to fit the screen: a <button> sizes to its content,
  // so it happily runs off the right edge if nothing stops it.
  const strip = await page.locator('.crow-collapsed').boundingBox()
  const width = await page.evaluate(() => window.innerWidth)
  expect((strip?.x ?? 0) + (strip?.width ?? 0)).toBeLessThanOrEqual(width)
  await expect(page.locator('.crow-collapsed-caret')).toBeVisible()

  await page.locator('[data-action="expand-crow"]').tap()
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'expanded')
  await expect(page.locator('.crow-figure')).toBeVisible()
})

test('a swipe down on the strip brings the board back', async ({ page }) => {
  await swipeY(page, '.crow-expanded', 260, 180)
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'collapsed')
  await swipeY(page, '.crow-collapsed', 100, 220)
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'expanded')
})

test('the collapse follows the finger and springs back short of the threshold', async ({ page }) => {
  // Let the web fonts land first: they change the bubble's height, and the
  // figure and the row follow it.
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(200)
  const full = await page.locator('.crow-expanded').evaluate((el) => (el as HTMLElement).offsetHeight)
  // Touch down and drag 30px up — under the donor's 40px — without letting go.
  const mid = await page.locator('.crow-expanded').evaluate((el) => {
    const fire = (type: string, y: number) => {
      const t = { identifier: 1, target: el, clientX: 200, clientY: y }
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [t] })
      Object.defineProperty(ev, 'changedTouches', { value: [t] })
      el.dispatchEvent(ev)
    }
    fire('touchstart', 200)
    fire('touchmove', 185)
    fire('touchmove', 170)
    const height = (el as HTMLElement).offsetHeight
    fire('touchend', 170)
    return height
  })
  expect(mid).toBeLessThan(full - 10)
  expect(mid).toBeGreaterThan(0)
  // Released short of 40px: back to the open board, at its natural height.
  await page.waitForTimeout(400)
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'expanded')
  expect(await page.locator('.crow-expanded').evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(full)
})

test('a swipe down on the open board opens the chat, as in NeverMind', async ({ page }) => {
  await swipeY(page, '.crow-expanded', 160, 300)
  await expect(page.locator('#crow-chat-window')).toHaveClass(/open/)
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'expanded')
})

test('collapsing gives the screen its space back', async ({ page }) => {
  const before = await page.locator('#screen-control').boundingBox()
  await swipeY(page, '.crow-expanded', 260, 180)
  await expect(page.locator('#crow-zone')).toHaveAttribute('data-state', 'collapsed')
  await expect.poll(async () => (await page.locator('#screen-control').boundingBox())?.height ?? 0)
    .toBeGreaterThan(before?.height ?? 0)
})

test('the input is present on every module', async ({ page }) => {
  for (const id of ['control', 'agents', 'projects', 'events']) {
    await gotoModule(page, id)
    await expect(page.locator('#crow-input')).toBeVisible()
  }
})

test('the chat opens compact, expands to full, and closes', async ({ page }) => {
  const win = page.locator('#crow-chat-window')
  await expect(win).not.toHaveClass(/open/)

  await page.locator('#crow-input').tap()
  await expect(win).toHaveClass(/open/)
  // Wait for the open animation before measuring, or the height read is a frame
  // somewhere in the middle of it.
  await page.waitForTimeout(500)
  const compact = (await win.boundingBox())?.height ?? 0
  expect(compact).toBeGreaterThan(150)

  await swipeY(page, '#crow-chat-handle', 300, 180)    // up: compact → full
  await page.waitForTimeout(500)
  const full = (await win.boundingBox())?.height ?? 0
  expect(full).toBeGreaterThan(compact)

  await swipeY(page, '#crow-chat-handle', 180, 340)    // down: full → compact
  await page.waitForTimeout(500)
  const backToCompact = (await win.boundingBox())?.height ?? 0
  expect(backToCompact).toBeLessThan(full)
})

test('one conversation: it survives moving between modules', async ({ page }) => {
  await page.locator('#crow-input').fill('перевірка памʼяті чату')
  await page.locator('[data-action="send-crow"]').tap()
  await expect(page.locator('.msg-bubble--user')).toContainText('перевірка памʼяті чату')
  await expect(page.locator('.msg-bubble--agent').last()).toBeVisible()

  await gotoModule(page, 'agents')
  await expect(page.locator('#crow-chat-window')).toHaveClass(/open/)
  await expect(page.locator('.msg-bubble--user')).toContainText('перевірка памʼяті чату')
})

test('closing the chat does not wipe what I was typing', async ({ page }) => {
  await page.locator('#crow-input').fill('недописана думка')
  await swipeY(page, '#crow-chat-handle', 200, 340)   // swipe down closes
  await gotoModule(page, 'projects')
  await expect(page.locator('#crow-input')).toHaveValue('недописана думка')
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
  await page.locator('#crow-input').tap()
  await expect(page.locator('#chat-context')).toContainText('Окремі ключі для клієнтів')

  await page.locator('#crow-input').fill('А чого це заблоковано?')
  await page.locator('[data-action="send-crow"]').tap()

  const reply = page.locator('.msg-bubble--agent').last()
  await expect(reply).toContainText('Окремі ключі для клієнтів')
  await expect(reply).toContainText('Roman AI OS / GBrain')
  await expect(reply).toContainText('Чекає на: Роман')
})

test('one object, one id: the same blocker reached from Control', async ({ page }) => {
  // Tap it in the "потребує мене" list on Control, not in Crow's bubble.
  await page.locator('[data-action="open-attention"]', { hasText: 'Окремі ключі для клієнтів' }).tap()
  await expect(page.locator('#screen-projects')).toHaveClass(/active/)
  await expect(page.locator('#chat-context')).toContainText('Окремі ключі для клієнтів')

  await page.locator('#crow-input').fill('Чому?')
  await page.locator('[data-action="send-crow"]').tap()
  await expect(page.locator('.msg-bubble--agent').last()).toContainText('Hermes і Claude ділять один токен')
})

test('the source of every number is stated on screen', async ({ page }) => {
  await expect(page.locator('.source-tag').first()).toHaveText('демо')
  await expect(page.locator('.source-tag').first()).toHaveAttribute('data-origin', 'mock')
})
