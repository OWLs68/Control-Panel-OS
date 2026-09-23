/**
 * «Задачі» — the first slice of the native work tracker.
 *
 * Reading: the module takes its place in the bar (including on a phone whose
 * bar was saved before it existed), the five groups and the tiles, the honest
 * «локально» label, the selection Crow's envelope carries, and the demo reset
 * that leaves Roman's tasks alone. Tasks are put into storage directly here;
 * creating them on screen is the write path's job.
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

test('every control on «Задачі» is at least 44px', async ({ page }) => {
  await withTasks(page, [
    { id: 't-1', title: 'Щось із дуже довгою назвою, яка не влізе в один рядок на телефоні', needsRoman: true, at: 0 },
    { id: 't-2', title: 'Готове', status: 'done', at: 1 },
  ])
  await gotoModule(page, 'work')
  const small = await page.locator('#screen-work').evaluate((root) => {
    const bad: string[] = []
    root.querySelectorAll('button, [data-action]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      if (r.height < 44 || r.width < 44) bad.push(`${(el as HTMLElement).className} ${Math.round(r.width)}x${Math.round(r.height)}`)
    })
    return bad
  })
  expect(small).toEqual([])
})
