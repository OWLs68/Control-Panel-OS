/**
 * Live memory — GBrain through the gateway, with the gateway played by
 * page.route(). Tailscale is not needed here: what these prove is the phone's
 * side of the seam — what it shows, what it keeps, and what it says when the
 * Mac is not there.
 */
import { expect, test, type Page, type Route } from '@playwright/test'
import { gotoModule } from './helpers.js'

// The service worker is off for this file. It passes cross-origin requests
// through untouched (sw.js:62) — but once it controls the page, headless
// WebKit's Playwright no longer sees the requests it passes through, so the
// routed gateway below would be unreachable on the second fetch. Chromium does
// see them, and the last test in this file proves the pass-through there.
test.use({ serviceWorkers: 'block' })

const GW = 'https://gw.test'
const ALL_MODULES = ['control', 'agents', 'projects', 'memory', 'events']

const fact = (id: string, text: string, category = 'preference') => ({
  id, user_id: null, created_at: '2026-09-20T22:53:19.774Z', updated_at: '2026-09-20T22:53:19.774Z',
  deleted_at: null, hlc: null, text, category, ts: Date.parse('2026-09-20T22:53:17.918Z'),
})
const FACT_78 = fact('78', 'Runtime canonical source перемагає старіший STATE.')
const FACT_79 = fact('79', 'Salient writeback працює через client-side routing.', 'system')

function snapshot(memory: unknown[], events?: unknown[]) {
  return { memory, fetchedAt: Date.now(), source: 'gbrain:recall', ...(events ? { events } : {}) }
}

/** An event as the Event Center stamps it (server/roma-gateway/src/events.ts). */
const liveEvent = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  deleted_at: null, hlc: null, ts: Date.now() - 60_000, kind: 'agent_result', title: `Подія ${id}`, detail: '',
  source: 'curl', agentId: null, taskId: null, projectId: null, severity: 'info', needsRoman: false, ...over,
})
const EV_ALERT = liveEvent('curl:test:1', { kind: 'alert', title: 'Тест з Mac', needsRoman: true, severity: 'warning', ts: Date.now() - 30_000 })
const EV_DONE = liveEvent('curl:test:2', { kind: 'agent_finished', title: 'Скан завершено', detail: '2 товари, 0 знижок', source: 'shopping-scout' })

async function serveJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function bootLive(page: Page, url: string | null = GW): Promise<void> {
  await page.addInitScript(({ url, modules }) => {
    localStorage.setItem('roma_data_source', 'live')
    if (url) localStorage.setItem('roma_gateway_url', url)
    else localStorage.removeItem('roma_gateway_url')
    localStorage.setItem('roma_active_modules', JSON.stringify(modules))
  }, { url, modules: ALL_MODULES })
}

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
}

test('memory comes from the gateway, marked live; the other screens stay demo', async ({ page }) => {
  let hits = 0
  await page.route(`${GW}/**`, (route) => { hits++; return serveJson(route, 200, snapshot([FACT_78])) })
  await bootLive(page)
  await ready(page)

  // Control never asked the gateway for anything and still says «демо».
  await expect(page.locator('#screen-control .source-tag[data-origin="mock"]').first()).toBeVisible()

  await gotoModule(page, 'memory')
  const screen = page.locator('#screen-memory')
  await expect(screen.getByText(FACT_78.text)).toBeVisible()
  const tag = screen.locator('.source-tag')
  await expect(tag).toHaveAttribute('data-origin', 'live')
  await expect(tag).toHaveText('наживо')
  await expect(tag).toHaveAttribute('title', 'gbrain:recall')
  await expect(screen.locator('.data-notice')).toContainText('Джерело: gbrain:recall · оновлено щойно')
  await expect(screen.locator('.data-notice')).not.toContainText('не підключений')
  // The request left the page and reached the (routed) gateway: the worker did not swallow it.
  expect(hits).toBeGreaterThanOrEqual(1)

  // Projects is a delegated read: its notice names the demo fixtures, not the gateway.
  await gotoModule(page, 'projects')
  await expect(page.locator('#screen-projects .data-notice')).toContainText('Джерело: демо-дані · fixtures:projects')
})

test('live Control never passes demo «Потребує мене» off as real, and the map draws live apart from demo', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78])))
  await bootLive(page)
  await ready(page)

  const screen = page.locator('#screen-control')
  // The tile does not count demo rows next to live data; the card says why, and names where the real ones are.
  await expect(screen.locator('.metric').first().locator('.metric-num')).toHaveText('—')
  await expect(screen.getByText('Наживо ще немає даних')).toBeVisible()
  await expect(screen.getByText('Окремі ключі для клієнтів')).toHaveCount(0)
  // Crow's greeting and the bell do not raise a demo item either.
  await expect(page.locator('#crow-text')).toContainText('наживо ще не підʼєднане')
  await expect(page.locator('#crow-bubble')).toHaveAttribute('data-priority', 'normal')
  await expect(page.locator('#notif-dot')).toBeHidden()

  // The map's lines come from each read's origin: memory is live, the rest is still demo.
  await expect(screen.locator('.map-edge[data-node="memory"]')).toHaveAttribute('data-edge', 'live')
  for (const node of ['agents', 'projects', 'events', 'access']) {
    await expect(screen.locator(`.map-edge[data-node="${node}"]`)).toHaveAttribute('data-edge', 'stub')
  }
  await expect(screen.locator('.map-edge[data-edge="blocked"]')).toHaveCount(0)
})

test('demo Control keeps its demo rows, marked demo, and its map draws nothing as live', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  const screen = page.locator('#screen-control')
  await expect(screen.getByText('Окремі ключі для клієнтів')).toBeVisible()
  await expect(screen.locator('.source-tag[data-origin="mock"]').first()).toBeVisible()
  await expect(screen.locator('.map-edge[data-edge="live"]')).toHaveCount(0)
  await expect(page.locator('#notif-dot')).toBeVisible()
})

/**
 * Boot on one fact, then make the gateway answer with two and fire pageshow —
 * a bfcache restore — once the 5s guard against a double first load has
 * passed. First the request must reach the (routed) gateway, then the screen
 * must show both rows without a navigation: that is emitDataChanged at work.
 */
async function refreshShowsSecondFact(page: Page): Promise<void> {
  let facts = [FACT_78]
  let hits = 0
  await page.route(`${GW}/**`, (route) => { hits++; return serveJson(route, 200, snapshot(facts)) })
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory .card-row')).toHaveCount(1)

  facts = [FACT_79, FACT_78]
  const before = hits
  await page.waitForTimeout(5_200)
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expect.poll(() => hits, { message: 'the refresh never reached the gateway' }).toBeGreaterThan(before)
  await expect(page.locator('#screen-memory .card-row')).toHaveCount(2)
  await expect(page.locator('#screen-memory').getByText(FACT_79.text)).toBeVisible()
}

test('a refresh redraws the screen you are looking at', async ({ page }) => {
  await refreshShowsSecondFact(page)
})

test('when the Mac is gone the last snapshot stays, and says so', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78])))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory').getByText(FACT_78.text)).toBeVisible()

  // Now the tunnel is down: the request fails outright.
  await page.unroute(`${GW}/**`)
  await page.route(`${GW}/**`, (route) => route.abort('failed'))
  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await gotoModule(page, 'memory')
  const screen = page.locator('#screen-memory')
  await expect(screen.getByText(FACT_78.text)).toBeVisible()
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  await expect(screen.locator('.data-notice')).toContainText('Оновлено щойно · Mac недоступний')
  // The cache is the normalised snapshot and nothing else.
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('roma_live_snapshot') ?? 'null'))
  expect(Object.keys(cached).sort()).toEqual(['fetchedAt', 'memory', 'source'])
})

test('403 is «немає доступу», not a demo screen', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 403, { error: 'forbidden' }))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  const screen = page.locator('#screen-memory')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  await expect(screen.locator('.data-notice')).toContainText('Немає даних · немає доступу')
  await expect(screen.getByText('Памʼять порожня')).toBeVisible()
})

test('garbage from the gateway is «відповідь не розпізнана»', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, '<html>oops'))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory .data-notice')).toContainText('відповідь gateway не розпізнана')
})

test('live without an address says so, and the settings row shows where to type it', async ({ page }) => {
  await bootLive(page, null)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory .data-notice')).toContainText('адресу gateway не задано')

  await page.locator('[data-action="open-settings"]').tap()
  await expect(page.locator('#settings-gateway-row')).toBeVisible()
  await expect(page.locator('#settings-gateway-status')).toContainText('Адресу не задано')
  await expect(page.locator('[data-action="settings-source"][data-source="live"]')).toHaveClass(/active/)
})

test('back to demo drops the live cache and the demo facts return', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78])))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory').getByText(FACT_78.text)).toBeVisible()

  await page.locator('[data-action="open-settings"]').tap()
  await page.locator('[data-action="settings-source"][data-source="demo"]').tap()
  await expect(page.locator('#settings-gateway-row')).toHaveCount(0)
  await page.locator('#settings-modal').tap({ position: { x: 20, y: 20 } })
  await expect(page.locator('#settings-modal')).toHaveCount(0)

  const screen = page.locator('#screen-memory')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'mock')
  await expect(screen.getByText(FACT_78.text)).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('roma_live_snapshot'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('roma_data_source'))).toBe('demo')
})

test.describe('with the service worker in control', () => {
  test.use({ serviceWorkers: 'allow' })

  test('the worker passes the gateway request through, and the screen still redraws', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'headless WebKit hides worker pass-through requests from Playwright')
    // A reload puts the page under the worker's control before the refresh.
    await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78])))
    await bootLive(page)
    await ready(page)
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await page.unroute(`${GW}/**`)
    await refreshShowsSecondFact(page)
  })
})

test('live events: the Event Center feed on «Події» and on Control, marked live, what waits on Roman flagged', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78], [EV_DONE, EV_ALERT])))
  await bootLive(page)
  await ready(page)

  // Control counts the live events and draws their line solid.
  const control = page.locator('#screen-control')
  await expect(control.locator('.metric').nth(3).locator('.metric-num')).toHaveText('2')
  await expect(control.locator('.map-edge[data-node="events"]')).toHaveAttribute('data-edge', 'live')
  await expect(control.getByText('Тест з Mac')).toBeVisible()

  await gotoModule(page, 'events')
  const screen = page.locator('#screen-events')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  await expect(screen.locator('.source-tag')).toHaveAttribute('title', 'gateway:events')
  // Newest first; the demo feed is gone.
  await expect(screen.locator('.card-row-title')).toHaveText(['Тест з Mac', 'Скан завершено'])
  await expect(screen.getByText('Roma OS: етап 0 завершено')).toHaveCount(0)
  const alert = screen.locator('.card-row', { hasText: 'Тест з Mac' })
  await expect(alert.locator('.badge')).toHaveText(['потребує мене', 'важливо'])
  await expect(alert.locator('.dot-warning')).toHaveCount(1)
  await expect(screen.locator('.card-row', { hasText: 'Скан завершено' })).toContainText('2 товари, 0 знижок')
  await expect(screen.locator('.data-notice')).toContainText('Джерело: gateway:events · оновлено щойно')
  await expect(page.locator('#crow-text')).toContainText('1 подія чекає на тебе')

  // The phone keeps the events with the snapshot — and nothing else.
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('roma_live_snapshot') ?? 'null'))
  expect(Object.keys(cached).sort()).toEqual(['events', 'fetchedAt', 'memory', 'source'])
})

test('a gateway without the Event Center leaves the feed on demo, and says why', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78])))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'events')
  const screen = page.locator('#screen-events')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'mock')
  await expect(screen.locator('.data-notice')).toContainText('Живих подій ще немає: Event Center на Mac не ввімкнений')
  await expect(page.locator('#screen-control .map-edge[data-node="events"]')).toHaveAttribute('data-edge', 'stub')
})

test('when the Mac is gone the last events stay, with their age and the reason', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78], [EV_ALERT])))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'events')
  await expect(page.locator('#screen-events').getByText('Тест з Mac')).toBeVisible()

  await page.unroute(`${GW}/**`)
  await page.route(`${GW}/**`, (route) => route.abort('failed'))
  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await gotoModule(page, 'events')
  const screen = page.locator('#screen-events')
  await expect(screen.getByText('Тест з Mac')).toBeVisible()
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  await expect(screen.locator('.data-notice')).toContainText('Оновлено щойно · Mac недоступний')
})

test('an empty live feed is live and empty, not demo', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78], [])))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'events')
  const screen = page.locator('#screen-events')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  await expect(screen.getByText('Жоден агент ще нічого не повідомив.')).toBeVisible()
})

test('demo mode: the demo feed, and it says it is demo', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await gotoModule(page, 'events')
  const screen = page.locator('#screen-events')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'mock')
  await expect(screen.locator('.data-notice')).toContainText('Демо-режим')
})
