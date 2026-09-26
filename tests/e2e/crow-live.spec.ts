/**
 * Crow live — Hermes through the Roma gateway, with the gateway played by
 * page.route(). What these prove is the phone's side of the seam: in live
 * mode every question leaves through POST /api/v1/crow with its envelope,
 * the one reply is shown, a dead gateway is named — never the stub — and
 * demo mode still answers from the stub without touching the network.
 */
import { expect, test, type Page, type Route } from '@playwright/test'
import { gotoModule } from './helpers.js'

// As in live.spec.ts: the worker passes cross-origin requests through, but
// headless WebKit hides pass-through requests from Playwright's routing.
test.use({ serviceWorkers: 'block' })

const GW = 'https://gw.test'
const ALL_MODULES = ['control', 'agents', 'projects', 'memory', 'events']
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'cache-control': 'no-store',
}

interface CrowBody { text: string; context: { activeModule: string; selection: string | null }; history: unknown[]; requestId: string }

async function bootLive(page: Page): Promise<void> {
  await page.addInitScript(({ url, modules }) => {
    localStorage.setItem('roma_data_source', 'live')
    localStorage.setItem('roma_gateway_url', url)
    localStorage.setItem('roma_active_modules', JSON.stringify(modules))
  }, { url: GW, modules: ALL_MODULES })
}

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
}

/** The gateway: memory answers empty, Crow answers as told. Preflights are answered for the POST. */
function routeGateway(page: Page, crow: (body: CrowBody, route: Route) => Promise<void>): { crowCalls: CrowBody[] } {
  const seen = { crowCalls: [] as CrowBody[] }
  void page.route(`${GW}/**`, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
    const path = new URL(req.url()).pathname
    if (path === '/api/v1/state') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ memory: [], fetchedAt: Date.now(), source: 'gbrain:recall' }) })
      return
    }
    if (path === '/api/v1/crow' && req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}') as CrowBody
      seen.crowCalls.push(body)
      await crow(body, route)
      return
    }
    await route.fulfill({ status: 404, headers: CORS, body: '{"error":"not_found"}' })
  })
  return seen
}

async function send(page: Page, text: string): Promise<void> {
  await page.locator('#crow-input').fill(text)
  await page.locator('[data-action="send-crow"]').tap()
  await expect(page.locator('.msg-bubble--user').last()).toContainText(text)
}

test('live: a question leaves with its envelope and the one Hermes reply comes back', async ({ page }) => {
  const seen = routeGateway(page, async (body, route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ requestId: body.requestId, text: `Hermes каже: ${body.text} · ${body.context.activeModule}`, chips: [], priority: 'normal' }),
    })
  })
  await bootLive(page)
  await ready(page)
  // Control says Crow is live now, not a stub.
  await expect(page.locator('#screen-control')).toContainText('Crow іде через gateway')

  await send(page, 'Що каже GBrain?')
  const reply = page.locator('.msg-bubble--agent').last()
  await expect(reply).toHaveText('Hermes каже: Що каже GBrain? · control')
  await expect(page.locator('.msg-bubble--agent', { hasText: 'заглушки' })).toHaveCount(0)

  expect(seen.crowCalls).toHaveLength(1)
  const body = seen.crowCalls[0] as CrowBody
  expect(body.text).toBe('Що каже GBrain?')
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(body.context.activeModule).toBe('control')
  expect(Array.isArray(body.history)).toBe(true)
  // The reply is in the saved conversation too, so it survives a reload.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('roma_chat') ?? '[]') as Array<{ role: string; text: string }>)
  expect(saved[saved.length - 1]).toEqual(expect.objectContaining({ role: 'agent', text: 'Hermes каже: Що каже GBrain? · control' }))
})

test('live: the gateway carries the screen context — ask about a blocker with a pronoun', async ({ page }) => {
  const seen = routeGateway(page, async (body, route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ requestId: body.requestId, text: `Про «${body.context.selection}»`, chips: [], priority: 'normal' }),
    })
  })
  await bootLive(page)
  await ready(page)
  // Live Control no longer lists the demo attention rows, so the blocker is picked where it lives: Projects.
  await gotoModule(page, 'projects')
  await page.locator('[data-action="toggle-blocker"]', { hasText: 'Окремі ключі для клієнтів' }).tap()
  await send(page, 'А чого це заблоковано?')
  // The Projects module names the selection as «project › blocker» (projects.ts context()).
  await expect(page.locator('.msg-bubble--agent').last()).toHaveText('Про «Roman AI OS / GBrain › Окремі ключі для клієнтів»')
  const body = seen.crowCalls[0] as CrowBody & { context: { activeEntity: string | null; selectedItem: string | null } }
  expect(body.context.selection).toBe('Roman AI OS / GBrain › Окремі ключі для клієнтів')
  expect(body.context.activeEntity).toBe('blocker')
  expect(body.context.selectedItem).toBeTruthy()
})

test('live: Hermes down is «Hermes не відповідає», busy is «зачекай» — never a stub answer', async ({ page }) => {
  let status = 502
  routeGateway(page, async (_body, route) => {
    await route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: status === 502 ? 'hermes_unavailable' : 'busy' }) })
  })
  await bootLive(page)
  await ready(page)

  await send(page, 'Є хто живий?')
  await expect(page.locator('.msg-bubble--agent').last()).toHaveText('Hermes не відповідає.')

  status = 409
  await send(page, 'А зараз?')
  await expect(page.locator('.msg-bubble--agent').last()).toHaveText('Забагато запитів поспіль. Трохи зачекай.')
  await expect(page.locator('.msg-bubble--agent', { hasText: 'заглушки' })).toHaveCount(0)
})

test('live without an address: Crow says so instead of pretending', async ({ page }) => {
  await page.addInitScript((modules) => {
    localStorage.setItem('roma_data_source', 'live')
    localStorage.removeItem('roma_gateway_url')
    localStorage.setItem('roma_active_modules', JSON.stringify(modules))
  }, ALL_MODULES)
  await ready(page)
  await send(page, 'Привіт')
  await expect(page.locator('.msg-bubble--agent').last()).toHaveText('Hermes не підключений: адресу gateway не задано в налаштуваннях.')
})

test('demo: the stub still answers and nothing leaves the phone', async ({ page }) => {
  const seen = routeGateway(page, async (_body, route) => { await route.abort('failed') })
  await ready(page)
  await expect(page.locator('#screen-control')).toContainText('Crow відповідає із заглушки')
  // No stub keyword in the text («crow», «агент», «блок»…): the default reply is the one that names the stub.
  await send(page, 'Привіт')
  await expect(page.locator('.msg-bubble--agent').last()).toContainText('відповідаю із заглушки')
  expect(seen.crowCalls).toHaveLength(0)
})
