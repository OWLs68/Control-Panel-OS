/**
 * «Задачі» — the first slice of the native work tracker.
 *
 * Reading: the module takes its place in the bar (including on a phone whose
 * bar was saved before it existed), the five groups and the tiles, the honest
 * «локально» label, the selection Crow's envelope carries, and the demo reset
 * that leaves Roman's tasks alone. Writing: a new task from the screen, a
 * status changed from the task's card, the «Потребує мене» switch — each
 * surviving a reload. Tasks for the reading tests are put into storage
 * directly; the writing tests make them on screen.
 */
import { expect, test, type Page } from '@playwright/test'
import { gotoModule } from './helpers.js'

interface Seed { id: string; title: string; status?: string; needsRoman?: boolean; at: number }

/** A task as the store writes it; `at` is seconds past a fixed minute, so the order is known. */
function stored(t: Seed) {
  const iso = new Date(Date.UTC(2026, 8, 23, 10, 0, t.at)).toISOString()
  return {
    id: t.id, user_id: null, created_at: iso, updated_at: iso, deleted_at: null, hlc: null,
    title: t.title, status: t.status ?? 'backlog', needsRoman: t.needsRoman ?? false,
    projectId: null, agentId: null, blockerId: null,
  }
}

async function ready(page: Page): Promise<void> {
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
}

/** Put tasks in storage once and boot again, as if they had been there all along. */
async function withTasks(page: Page, tasks: Seed[]): Promise<void> {
  await page.evaluate((rows) => localStorage.setItem('roma_tasks', JSON.stringify(rows)), tasks.map(stored))
  await page.reload()
  await ready(page)
}

const group = (page: Page, label: string) =>
  page.locator('#screen-work .card', { has: page.locator('.card-head', { hasText: label }) })

const taskRow = (page: Page, id: string) => page.locator(`[data-action="open-task"][data-id="${id}"]`)

const tabOrder = (page: Page) =>
  page.locator('.tab-item').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tab))

/** A card modal that has finished popping in, so a tap lands where it is aimed. */
async function cardOpen(page: Page, id: string): Promise<void> {
  const card = page.locator(`#${id} .modal-card`)
  await expect(card).toHaveClass(/open/)
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)')
}

/** Tap the backdrop, as a thumb would, and wait for the card to go. */
async function closeCard(page: Page, id: string): Promise<void> {
  await page.locator(`#${id}`).tap({ position: { x: 20, y: 20 } })
  await expect(page.locator(`#${id}`)).toHaveCount(0)
}

const storedTasks = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('roma_tasks') ?? '[]') as Array<Record<string, unknown>>)

/** Every button and action on `root` is at least 44px each way. */
function smallTargets(root: Element): string[] {
  const bad: string[] = []
  root.querySelectorAll('button, [data-action]').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    if (r.height < 44 || r.width < 44) bad.push(`${(el as HTMLElement).className} ${Math.round(r.width)}x${Math.round(r.height)}`)
  })
  return bad
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await ready(page)
})

test('«Задачі» stands second in the bar, right after Control', async ({ page }) => {
  expect(await tabOrder(page)).toEqual(['control', 'work', 'agents', 'projects', 'events'])
})

test('a bar saved before «Задачі» existed gets it once, after Control; hiding it then sticks', async ({ page }) => {
  // An installation from before the module: a saved bar in its own order, no record of the offer.
  await page.evaluate(() => {
    localStorage.setItem('roma_active_modules', JSON.stringify(['control', 'events', 'agents']))
    localStorage.removeItem('roma_modules_added')
  })
  await page.reload()
  await ready(page)
  expect(await tabOrder(page)).toEqual(['control', 'work', 'events', 'agents'])

  await page.reload()
  await ready(page)
  expect(await tabOrder(page)).toEqual(['control', 'work', 'events', 'agents'])

  await page.locator('[data-action="open-modules"]').tap()
  await page.locator('.mod-card[data-id="work"]').tap()
  await page.locator('[data-action="apply-modules"]').tap()
  expect(await tabOrder(page)).toEqual(['control', 'events', 'agents'])
  await page.reload()
  await ready(page)
  expect(await tabOrder(page)).toEqual(['control', 'events', 'agents'])
})

test('an empty board: five groups in order, zero tiles, tasks marked «локально»', async ({ page }) => {
  await gotoModule(page, 'work')
  expect(await page.locator('#screen-work .card-head > span:first-of-type').allTextContents())
    .toEqual(['Беклог', 'Заплановано', 'У роботі', 'Заблоковано', 'Готово'])
  expect(await page.locator('#screen-work .metric-num').allTextContents()).toEqual(['0', '0', '0', '0'])
  await expect(group(page, 'Беклог')).toContainText('Задач ще немає')
  await expect(group(page, 'Готово')).toContainText('Порожньо')
  const tag = page.locator('#screen-work .source-tag').first()
  await expect(tag).toHaveText('локально')
  await expect(tag).toHaveAttribute('data-origin', 'local')
})

test('tasks land in their groups: waiting on Roman first and counted, Done dimmed', async ({ page }) => {
  await withTasks(page, [
    { id: 't-old', title: 'Старе з беклогу', at: 1 },
    { id: 't-new', title: 'Нове з беклогу', at: 5 },
    { id: 't-roman', title: 'Чекає Романа', needsRoman: true, at: 0 },
    { id: 't-work', title: 'Робиться', status: 'in_progress', at: 2 },
    { id: 't-stuck', title: 'Застрягло', status: 'blocked', at: 3 },
    { id: 't-done', title: 'Зроблено', status: 'done', needsRoman: true, at: 4 },
  ])
  await gotoModule(page, 'work')

  expect(await group(page, 'Беклог').locator('.card-row-title').allTextContents())
    .toEqual(['Чекає Романа', 'Нове з беклогу', 'Старе з беклогу'])
  await expect(group(page, 'Беклог').locator('.card-head .badge')).toHaveText('3')
  await expect(group(page, 'У роботі')).toContainText('Робиться')
  await expect(group(page, 'Заблоковано')).toContainText('Застрягло')
  await expect(group(page, 'Заплановано')).toContainText('Порожньо')

  // «Потребує мене» counts only what is not finished: the done task's flag does not count.
  expect(await page.locator('#screen-work .metric-num').allTextContents()).toEqual(['1', '1', '1', '1'])
  await expect(taskRow(page, 't-roman').locator('.badge')).toHaveText('потребує мене')
  await expect(taskRow(page, 't-done')).toHaveClass(/is-done/)
  await expect(taskRow(page, 't-done').locator('.badge')).toHaveCount(0)
})

test('a tapped task is selected, and Crow is told which one', async ({ page }) => {
  await withTasks(page, [{ id: 't-1', title: 'Подзвонити бухгалтеру', at: 0 }])
  await gotoModule(page, 'work')
  await taskRow(page, 't-1').tap()
  // The tap opens the task's card too; closing it keeps the task selected.
  await cardOpen(page, 'task-card-modal')
  await closeCard(page, 'task-card-modal')
  await expect(taskRow(page, 't-1')).toContainText('відкрито')

  await page.locator('#crow-input').tap()
  await expect(page.locator('#chat-context')).toContainText('Задачі › Подзвонити бухгалтеру')
  await page.locator('#crow-input').fill('Що з цим?')
  await page.locator('[data-action="send-crow"]').tap()
  await expect(page.locator('.msg-bubble--agent').last()).toContainText('Подзвонити бухгалтеру')
})

test('the demo reset leaves Roman\'s tasks alone', async ({ page }) => {
  await withTasks(page, [{ id: 't-keep', title: 'Не чіпати', at: 0 }])
  await page.locator('[data-action="open-settings"]').tap()
  const card = page.locator('#settings-modal .modal-card')
  await expect(card).toHaveClass(/open/)
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)')
  await page.locator('[data-action="settings-reset-demo"]').tap()
  await page.locator('#settings-modal').tap({ position: { x: 20, y: 20 } })
  await expect(page.locator('#settings-modal')).toHaveCount(0)

  await gotoModule(page, 'work')
  await expect(taskRow(page, 't-keep')).toBeVisible()
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('roma_tasks') ?? '[]') as unknown[]).length)).toBe(1)
})

test('every control on «Задачі» and in both cards is at least 44px', async ({ page }) => {
  await withTasks(page, [
    { id: 't-1', title: 'Щось із дуже довгою назвою, яка не влізе в один рядок на телефоні', needsRoman: true, at: 0 },
    { id: 't-2', title: 'Готове', status: 'done', at: 1 },
  ])
  await gotoModule(page, 'work')
  expect(await page.locator('#screen-work').evaluate(smallTargets)).toEqual([])

  await taskRow(page, 't-1').tap()
  await cardOpen(page, 'task-card-modal')
  expect(await page.locator('#task-card-modal').evaluate(smallTargets)).toEqual([])
  await closeCard(page, 'task-card-modal')

  await page.locator('[data-action="task-new"]').tap()
  await cardOpen(page, 'task-new-modal')
  expect(await page.locator('#task-new-modal').evaluate(smallTargets)).toEqual([])
})

/* ── Writing ─────────────────────────────────────────────────────────── */

test('a new task: one field, «Створити» — it lands in Беклог and survives a reload', async ({ page }) => {
  await gotoModule(page, 'work')
  await page.locator('[data-action="task-new"]').tap()
  await cardOpen(page, 'task-new-modal')
  // Focused by the tap that opened the card, so the phone's keyboard comes up with it.
  await expect(page.locator('#task-new-title')).toBeFocused()
  await page.locator('#task-new-title').fill('  Купити   квитки  ')
  await page.locator('[data-action="task-create"]').tap()
  await expect(page.locator('#task-new-modal')).toHaveCount(0)
  await expect(group(page, 'Беклог').locator('.card-row-title')).toHaveText(['Купити квитки'])

  await page.reload()
  await ready(page)
  await gotoModule(page, 'work')
  await expect(group(page, 'Беклог').locator('.card-row-title')).toHaveText(['Купити квитки'])

  const saved = await storedTasks(page)
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({
    title: 'Купити квитки', status: 'backlog', needsRoman: false,
    projectId: null, agentId: null, blockerId: null, deleted_at: null,
  })
  expect(saved[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('Enter in the field creates the task as well', async ({ page }) => {
  await gotoModule(page, 'work')
  await page.locator('[data-action="task-new"]').tap()
  await cardOpen(page, 'task-new-modal')
  await page.locator('#task-new-title').fill('Через Enter')
  await page.locator('#task-new-title').press('Enter')
  await expect(page.locator('#task-new-modal')).toHaveCount(0)
  await expect(group(page, 'Беклог').locator('.card-row-title')).toHaveText(['Через Enter'])
})

test('an empty title is refused, and nothing is saved', async ({ page }) => {
  await gotoModule(page, 'work')
  await page.locator('[data-action="task-new"]').tap()
  await cardOpen(page, 'task-new-modal')
  await page.locator('#task-new-title').fill('   ')
  await page.locator('[data-action="task-create"]').tap()
  await expect(page.locator('.toast').last()).toHaveText('Введи назву задачі')
  await expect(page.locator('#task-new-modal')).toHaveCount(1)
  expect(await storedTasks(page)).toHaveLength(0)
})

test('the status is changed from the task\'s card, and it sticks', async ({ page }) => {
  await withTasks(page, [{ id: 't-1', title: 'Звіт за квартал', at: 0 }])
  await gotoModule(page, 'work')
  await taskRow(page, 't-1').tap()
  await cardOpen(page, 'task-card-modal')

  // Five statuses; the current one is marked.
  const rows = page.locator('#task-card-modal [data-action="task-set-status"]')
  await expect(rows).toHaveCount(5)
  await expect(rows.filter({ hasText: 'Беклог' })).toHaveAttribute('aria-pressed', 'true')

  await rows.filter({ hasText: 'У роботі' }).tap()
  await expect(page.locator('#task-card-modal')).toHaveCount(0)
  await expect(group(page, 'У роботі')).toContainText('Звіт за квартал')
  await expect(group(page, 'Беклог')).toContainText('Порожньо')
  expect(await page.locator('#screen-work .metric-num').allTextContents()).toEqual(['0', '1', '0', '0'])

  await page.reload()
  await ready(page)
  await gotoModule(page, 'work')
  await expect(group(page, 'У роботі')).toContainText('Звіт за квартал')
  expect((await storedTasks(page))[0]).toMatchObject({ status: 'in_progress' })
})

test('«Потребує мене» is a switch on the card: the badge and the tile follow it, both ways', async ({ page }) => {
  await withTasks(page, [{ id: 't-1', title: 'Рішення по бюджету', status: 'planned', at: 0 }])
  await gotoModule(page, 'work')
  await taskRow(page, 't-1').tap()
  await cardOpen(page, 'task-card-modal')

  const toggle = page.locator('#task-roman-row')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.tap()
  await expect(page.locator('#task-roman-row')).toHaveAttribute('aria-checked', 'true')
  // The card stays open; the board underneath has already caught up.
  await expect(page.locator('#task-card-modal')).toHaveCount(1)
  await expect(taskRow(page, 't-1')).toContainText('потребує мене')
  await expect(page.locator('#screen-work .metric-num').first()).toHaveText('1')

  await page.locator('#task-roman-row').tap()
  await expect(page.locator('#task-roman-row')).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('#screen-work .metric-num').first()).toHaveText('0')

  await page.locator('#task-roman-row').tap()
  await closeCard(page, 'task-card-modal')
  await page.reload()
  await ready(page)
  await gotoModule(page, 'work')
  await expect(taskRow(page, 't-1')).toContainText('потребує мене')
  expect((await storedTasks(page))[0]).toMatchObject({ needsRoman: true, status: 'planned' })
})
