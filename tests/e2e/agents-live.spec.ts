/**
 * Live agents, the agent screen and Shopping Scout's price card — with the
 * gateway played by page.route(), as in live.spec.ts. What these prove is the
 * phone's side: what it draws from a snapshot, what it keeps, and that the demo
 * mode is exactly what it was.
 */
import { expect, test, type Page, type Route } from '@playwright/test'
import { gotoModule } from './helpers.js'
import { shoppingFixture } from '../fixtures/shopping-prices.js'

// The service worker is off here for the same reason as in live.spec.ts.
test.use({ serviceWorkers: 'block' })

const GW = 'https://gw.test'
const ALL_MODULES = ['control', 'agents', 'projects', 'memory', 'events']
const HOUR = 3_600_000

const fact = {
  id: '78', user_id: null, created_at: '2026-09-20T22:53:19.774Z', updated_at: '2026-09-20T22:53:19.774Z',
  deleted_at: null, hlc: null, text: 'Runtime canonical source перемагає старіший STATE.', category: 'preference',
  ts: Date.parse('2026-09-20T22:53:17.918Z'),
}

const stamp = { user_id: null, created_at: '2026-09-29T10:00:00.000Z', updated_at: '2026-09-29T10:00:00.000Z', deleted_at: null, hlc: null }

/** An agent as the gateway derives it (server/roma-gateway/src/agents.ts). */
const agent = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  ...stamp, id, name, role: 'Роль', model: 'сервіс на Mac', status: 'unknown', risk: 'L0', task: null, lastActivity: null, ...over,
})

function scan(): Record<string, unknown> {
  const data = shoppingFixture() as Record<string, unknown>
  data.scannedAt = new Date(Date.now() - 2 * HOUR).toISOString()
  data.nextCheckAt = new Date(Date.now() + 22 * HOUR).toISOString()
  return data
}

const event = (id: string, over: Record<string, unknown> = {}) => ({
  ...stamp, id, ts: Date.now() - 2 * HOUR, kind: 'agent_result', title: `Подія ${id}`, detail: '', source: 'Shopping Scout',
  agentId: null, taskId: null, projectId: null, severity: 'info', needsRoman: false, ...over,
})

const SCOUT_EVENT = event('shopping-scout.scan.1', { title: 'Скан 07:00', detail: '3 товари, 1 знижка', agentId: 'shopping-scout', data: scan() })
const TEXT_EVENT = event('shopping-scout.scan.0', { title: 'Скан учора', agentId: 'shopping-scout', ts: Date.now() - 26 * HOUR })

const AGENTS = [
  agent('crow', 'Crow', { role: 'Оркестратор', model: 'Hermes', risk: 'L1', status: 'online' }),
  agent('shopping-scout', 'Shopping Scout', { role: 'Пошук знижок', status: 'idle', lastActivity: { ts: SCOUT_EVENT.ts, title: 'Скан 07:00' } }),
  agent('mac-worker', 'Mac Worker', { role: 'Виконавець на Mac', risk: 'L1' }),
]

function snapshot(extra: Record<string, unknown> = {}) {
  return { memory: [fact], fetchedAt: Date.now(), source: 'gbrain:recall', ...extra }
}

async function serveJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })
}

async function bootLive(page: Page, body: unknown = snapshot({ agents: AGENTS, events: [SCOUT_EVENT, TEXT_EVENT] })): Promise<void> {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, body))
  await page.addInitScript(({ url, modules }) => {
    localStorage.setItem('roma_data_source', 'live')
    localStorage.setItem('roma_gateway_url', url)
    localStorage.setItem('roma_active_modules', JSON.stringify(modules))
  }, { url: GW, modules: ALL_MODULES })
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
}

/**
 * Does anything on this screen reach past the phone's width? Measured on the
 * screen's own scroller once the screen has stopped sliding in: during the
 * switch it moves by translateX(22px), which WebKit counts into the page's
 * scrollWidth for a frame or two — that is the animation, not overflow.
 */
async function overflowsSideways(page: Page, id: string): Promise<boolean> {
  const el = page.locator(`#screen-${id}`)
  await el.evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished.catch(() => undefined))))
  return el.evaluate((node) => node.scrollWidth > node.clientWidth || node.getBoundingClientRect().right > window.innerWidth + 0.5)
}

const rowOf = (page: Page, id: string) => page.locator(`#screen-agents [data-action="select-agent"][data-id="${id}"]`)

test('live agents are marked наживо; the silent one says «немає даних», not offline', async ({ page }) => {
  await bootLive(page)
  await gotoModule(page, 'agents')
  const screen = page.locator('#screen-agents')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  await expect(screen.locator('.source-tag')).toHaveText('наживо')
  await expect(rowOf(page, 'crow')).toContainText('онлайн')
  await expect(rowOf(page, 'shopping-scout')).toContainText('чекає')
  await expect(rowOf(page, 'shopping-scout')).toContainText('Скан 07:00')
  await expect(rowOf(page, 'mac-worker')).toContainText('немає даних')
  await expect(rowOf(page, 'mac-worker')).not.toContainText('офлайн')
  // None of the demo agents leaks into the live list.
  await expect(screen.getByText('Codex')).toHaveCount(0)
})

test('a tap opens the agent\'s own screen, not an expanded row; «Агенти» brings the list back', async ({ page }) => {
  await bootLive(page)
  await gotoModule(page, 'agents')
  await rowOf(page, 'mac-worker').tap()
  const screen = page.locator('#screen-agents')
  await expect(screen.locator('[data-action="agent-back"]')).toBeVisible()
  await expect(screen.locator('.card-head', { hasText: 'Mac Worker' })).toBeVisible()
  await expect(screen.getByText('Gateway ще нічого не знає про цього агента.')).toBeVisible()
  await expect(screen.getByText('Немає даних').first()).toBeVisible()
  await expect(screen.getByText('Цей агент ще нічого не повідомив.')).toBeVisible()
  // The list is gone while the agent is open.
  await expect(rowOf(page, 'crow')).toHaveCount(0)

  await screen.locator('[data-action="agent-back"]').tap()
  await expect(rowOf(page, 'crow')).toBeVisible()
  await expect(screen.locator('[data-action="agent-back"]')).toHaveCount(0)
})

test('Shopping Scout\'s screen: status, last activity, the newest price card, its own events; read-only', async ({ page }) => {
  await bootLive(page)
  await gotoModule(page, 'agents')
  await rowOf(page, 'shopping-scout').tap()
  const screen = page.locator('#screen-agents')

  await expect(screen.getByText('Чекає наступного запуску.')).toBeVisible()
  await expect(screen.getByText('Скан 07:00 ·').first()).toBeVisible()

  const card = screen.locator('.price-card')
  await expect(card).toHaveCount(1)     // once, above the stream — not under every row
  // The day word depends on the hour the suite runs (unit tests pin it with a fixed clock); its shape does not.
  await expect(card.locator('.price-when')).toHaveText(/^(сьогодні|вчора), \d{2}:\d{2}$/)
  await expect(card.locator('.price-stores-line')).toHaveText('відповіли 5 з 6 магазинів')
  await expect(card.locator('.price-product')).toHaveCount(3)
  await expect(card.locator('.price-from').first()).toHaveText('від €1,09')
  await expect(card.locator('.price-store.is-cheapest')).toHaveCount(3)
  await expect(card.locator('.price-deal')).toHaveCount(1)
  await expect(card.locator('.price-deal-price')).toContainText('€2,49')
  await expect(card.locator('.price-foot')).toHaveText(/^Наступна перевірка: (сьогодні|завтра), \d{2}:\d{2}$/)

  // Its own events, newest first, as rows.
  await expect(screen.locator('.card-row', { hasText: 'Скан учора' })).toBeVisible()
  // Nothing on this screen starts or stops anything.
  for (const label of ['Запустити', 'Зупинити', 'Старт', 'Стоп']) await expect(screen.getByText(label)).toHaveCount(0)
})

test('the price card fits a 390px phone: no sideways scroll, ≥44px targets, the cheapest in dark green', async ({ page }) => {
  await bootLive(page)
  await gotoModule(page, 'agents')
  await rowOf(page, 'shopping-scout').tap()
  const card = page.locator('#screen-agents .price-card')
  await expect(card).toBeVisible()

  const m = await page.evaluate(() => {
    const vw = window.innerWidth
    const el = document.querySelector('#screen-agents .price-card') as HTMLElement
    const r = el.getBoundingClientRect()
    const screen = document.getElementById('screen-agents') as HTMLElement
    const overflowing = [...el.querySelectorAll('*')].filter((n) => (n as HTMLElement).getBoundingClientRect().right > r.right + 0.5).length
    const cheap = getComputedStyle(el.querySelector('.price-store.is-cheapest') as Element)
    const other = getComputedStyle(el.querySelector('.price-store:not(.is-cheapest)') as Element)
    const back = (document.querySelector('#screen-agents [data-action="agent-back"]') as HTMLElement).getBoundingClientRect()
    const ask = (document.querySelector('#screen-agents [data-action="ask-crow"]') as HTMLElement).getBoundingClientRect()
    const from = el.querySelector('.price-from') as HTMLElement
    return {
      vw, left: r.left, right: r.right, overflowing,
      pageScrollsSideways: document.documentElement.scrollWidth > vw || screen.scrollWidth > screen.clientWidth,
      cheapColor: cheap.color, cheapWeight: cheap.fontWeight, otherColor: other.color,
      backH: back.height, askH: ask.height, askW: ask.width,
      fromWraps: from.getBoundingClientRect().height > parseFloat(getComputedStyle(from).lineHeight || '0') * 1.6,
    }
  })
  expect(m.vw).toBe(390)
  expect(m.left).toBeGreaterThanOrEqual(0)
  expect(m.right).toBeLessThanOrEqual(m.vw)
  expect(m.overflowing).toBe(0)
  expect(m.pageScrollsSideways).toBe(false)
  expect(m.cheapColor).toBe('rgb(74, 99, 64)')      // #4a6340, the badges' green: text needs AA, --success is a fill
  expect(m.cheapWeight).toBe('800')
  expect(m.otherColor).not.toBe(m.cheapColor)
  expect(m.backH).toBeGreaterThanOrEqual(44)
  expect(m.askH).toBeGreaterThanOrEqual(44)
  expect(m.fromWraps).toBe(false)
})

test('any number of products and stores: the fixed template holds, the zone order never changes', async ({ page }) => {
  const big = scan()
  big.products = Array.from({ length: 12 }, (_, i) => ({
    name: `Товар номер ${i + 1} з довгою назвою, щоб перевірити перенесення`, brand: 'Марка', size: '1 л', emoji: '🧴', cheapest: 'Магазин 1',
    prices: Array.from({ length: 8 }, (_, j) => ({ store: `Магазин ${j + 1}`, price: 1 + j + i / 10 })),
  }))
  big.deals = []
  await bootLive(page, snapshot({ agents: AGENTS, events: [{ ...SCOUT_EVENT, data: big }] }))
  await gotoModule(page, 'agents')
  await rowOf(page, 'shopping-scout').tap()
  const card = page.locator('#screen-agents .price-card')
  await expect(card.locator('.price-product')).toHaveCount(12)
  await expect(card.locator('.price-store')).toHaveCount(96)
  await expect(card.locator('.price-none')).toHaveText('Нових знижок немає')
  const order = await card.evaluate((el) => [...el.children].map((c) => c.className.split(' ').filter((x) => x.startsWith('price-'))[0]))
  expect(order).toEqual(['price-head', 'price-zone', 'price-zone', 'price-foot'])
  expect(await overflowsSideways(page, 'agents')).toBe(false)
})

test('«Події»: the card sits under its event, and an event without a payload stays plain text', async ({ page }) => {
  await bootLive(page)
  await gotoModule(page, 'events')
  const screen = page.locator('#screen-events')
  await expect(screen.locator('.price-card')).toHaveCount(1)
  await expect(screen.locator('.event-data .price-card .price-product')).toHaveCount(3)
  await expect(screen.locator('.card-row', { hasText: 'Скан учора' })).toBeVisible()
  // Only the event that carries data has a card.
  const withCard = await screen.locator('.card-row').evaluateAll((rows) => rows.map((r) => r.nextElementSibling?.classList.contains('event-data') ?? false))
  expect(withCard).toEqual([true, false])
  expect(await overflowsSideways(page, 'events')).toBe(false)
})

test('an event whose payload is wrong is drawn as text; the rest of the snapshot is untouched', async ({ page }) => {
  const broken = scan()
  ;(broken.products as { prices: { price: number }[] }[])[0]!.prices[0]!.price = -5
  await bootLive(page, snapshot({ agents: AGENTS, events: [{ ...SCOUT_EVENT, data: broken }] }))
  await gotoModule(page, 'events')
  await expect(page.locator('#screen-events .price-card')).toHaveCount(0)
  await expect(page.locator('#screen-events').getByText('Скан 07:00')).toBeVisible()
})

test('Control «У роботі»: live rows show the last activity, and an agent with nothing to show has no row', async ({ page }) => {
  await bootLive(page)
  const screen = page.locator('#screen-control')
  const block = screen.locator('.card', { has: page.locator('.card-head', { hasText: 'У роботі' }) })
  await expect(block.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  const rows = block.locator('.card-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Shopping Scout')
  await expect(rows.first()).toContainText('Скан 07:00')
  // No row is empty.
  for (const text of await rows.allInnerTexts()) expect(text.replace(/\s+/g, '')).not.toBe('')
  await expect(screen.locator('.metric', { hasText: 'У роботі' }).locator('.metric-num')).toHaveText('1')
  // The map's agents line is live now; projects are still demo.
  await expect(screen.locator('.map-edge[data-node="agents"]')).toHaveAttribute('data-edge', 'live')
  await expect(screen.locator('.map-edge[data-node="projects"]')).toHaveAttribute('data-edge', 'stub')
  // Tapping the row opens that agent's screen.
  await rows.first().tap()
  await expect(page.locator('#screen-agents [data-action="agent-back"]')).toBeVisible()
  await expect(page.locator('#screen-agents .card-head', { hasText: 'Shopping Scout' })).toBeVisible()
})

test('Control «У роботі» with nobody heard from is an empty state, not empty rows', async ({ page }) => {
  await bootLive(page, snapshot({ agents: [agent('mac-worker', 'Mac Worker')] }))
  const block = page.locator('#screen-control .card', { has: page.locator('.card-head', { hasText: 'У роботі' }) })
  await expect(block.locator('.card-row')).toHaveCount(0)
  await expect(block.getByText('Жоден агент ще нічого не повідомив.')).toBeVisible()
})

test('projects and blockers stay demo, marked demo, next to live agents', async ({ page }) => {
  await bootLive(page)
  await gotoModule(page, 'projects')
  // The same notice live.spec.ts reads: projects say where they come from, and it is the demo fixtures.
  await expect(page.locator('#screen-projects .data-notice')).toContainText('Джерело: демо-дані · fixtures:projects')
})

test('an older gateway (no agents key) leaves the agents on the demo, marked demo', async ({ page }) => {
  await bootLive(page, snapshot())
  await gotoModule(page, 'agents')
  const screen = page.locator('#screen-agents')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'mock')
  await expect(screen.getByText('Claude Code').first()).toBeVisible()
})

test('a cache written before agents and payloads existed still loads; the Mac is away', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => route.abort('failed'))
  await page.addInitScript(({ url, modules, cache }) => {
    localStorage.setItem('roma_data_source', 'live')
    localStorage.setItem('roma_gateway_url', url)
    localStorage.setItem('roma_active_modules', JSON.stringify(modules))
    localStorage.setItem('roma_live_snapshot', JSON.stringify(cache))
  }, { url: GW, modules: ALL_MODULES, cache: { memory: [fact], fetchedAt: Date.now() - 60_000, source: 'gbrain:recall', events: [{ ...TEXT_EVENT }] } })
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory').getByText(fact.text)).toBeVisible()
  await gotoModule(page, 'agents')
  await expect(page.locator('#screen-agents .source-tag')).toHaveAttribute('data-origin', 'mock')
  await gotoModule(page, 'events')
  await expect(page.locator('#screen-events').getByText('Скан учора')).toBeVisible()
})

test('a cache that is garbage is dropped quietly: no crash, the demo is what shows', async ({ page }) => {
  const errors: string[] = []
  // WebKit reports «ResizeObserver loop completed with undelivered notifications» as an error event:
  // the browser's own note that an observer's callback moved layout, not a fault in the app (the
  // spec does not treat it as one). Every other page error still fails the test.
  page.on('pageerror', (e) => { if (!e.message.startsWith('ResizeObserver loop')) errors.push(e.message) })
  await page.route(`${GW}/**`, (route) => route.abort('failed'))
  await page.addInitScript(({ url, modules }) => {
    localStorage.setItem('roma_data_source', 'live')
    localStorage.setItem('roma_gateway_url', url)
    localStorage.setItem('roma_active_modules', JSON.stringify(modules))
    localStorage.setItem('roma_live_snapshot', '{"memory":[],"agents":"x"')   // cut off mid-write
  }, { url: GW, modules: ALL_MODULES })
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await gotoModule(page, 'agents')
  await expect(page.locator('#screen-agents .source-tag')).toHaveAttribute('data-origin', 'mock')
  expect(errors).toEqual([])
})

test('the new snapshot is kept on the phone and read back after a reload, agents and payload included', async ({ page }) => {
  await bootLive(page)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('roma_live_snapshot') ?? 'null')?.agents?.length ?? 0)).toBe(3)
  await page.unroute(`${GW}/**`)
  await page.route(`${GW}/**`, (route) => route.abort('failed'))
  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await gotoModule(page, 'agents')
  await expect(page.locator('#screen-agents .source-tag')).toHaveAttribute('data-origin', 'live')
  await rowOf(page, 'shopping-scout').tap()
  await expect(page.locator('#screen-agents .price-card')).toHaveCount(1)
})

test.describe('demo mode', () => {
  test.use({ serviceWorkers: 'allow' })

  test('the demo agents open the same screen, marked demo, and «Спитати Crow» asks in Roman\'s words', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
    await gotoModule(page, 'agents')
    const screen = page.locator('#screen-agents')
    await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'mock')
    await expect(screen.getByText('Codex')).toBeVisible()
    await screen.locator('[data-action="select-agent"]', { hasText: 'Claude Code' }).tap()
    await expect(screen.locator('.card-head', { hasText: 'Claude Code' })).toBeVisible()
    await expect(screen.locator('.source-tag').first()).toHaveAttribute('data-origin', 'mock')
    await expect(screen.getByText('Roma OS, етап 1').first()).toBeVisible()
    await expect(screen.getByText('У демо-режимі подій агента немає.')).toBeVisible()

    await screen.locator('[data-action="ask-crow"]').tap()
    await expect(page.locator('.msg-bubble--user').last()).toContainText('Розкажи про агента Claude Code')
    // Crow is told which agent is on screen.
    await expect(page.locator('#chat-context')).toContainText('Claude Code')
  })
})
