/**
 * Smoke-tests a DEPLOYED build over HTTP, at both a phone and a desktop viewport.
 *
 *   SMOKE_URL=https://owls68.github.io/Control-Panel-OS/ node scripts/smoke-deploy.mjs
 *
 * Checks what only a real deploy can break: the base path, client-side routing,
 * a hard refresh on a deep link (the 404.html fallback), service-worker scope,
 * and that every manifest icon actually resolves. Exits non-zero on any failure.
 */
import { chromium } from '@playwright/test'
import { resolveChromiumPath } from './chromium-path.mjs'

const BASE = (process.env.SMOKE_URL || 'http://127.0.0.1:4200/Control-Panel-OS/').replace(/\/?$/, '/')
const b = await chromium.launch({ executablePath: resolveChromiumPath() })
let fails = 0
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++ }

for (const [vp, label] of [[{width:1280,height:900},'desktop'],[{width:390,height:844},'iphone']]) {
  console.log(`\n--- ${label} ---`)
  const ctx = await b.newContext({ viewport: vp, isMobile: label==='iphone', hasTouch: label==='iphone' })
  const p = await ctx.newPage()
  const errs = []
  p.on('console', m => m.type()==='error' && errs.push(m.text()))
  p.on('pageerror', e => errs.push(e.message))

  await p.goto(BASE, { waitUntil: 'networkidle' })
  ok((await p.locator('h1').first().textContent()) === 'Огляд системи', 'root loads dashboard')
  ok((await p.getByTestId('origin-mock').count()) > 0, 'MOCK badge present')

  // client-side navigation
  for (const [nav, heading] of [['/projects','Проєкти'],['/memory','Памʼять'],['/agents','Агенти / AI-клієнти'],['/activity','Події'],['/settings','Налаштування']]) {
    await p.locator(`nav:visible a[href$="${nav}"]`).first().click()
    await p.waitForTimeout(250)
    ok((await p.locator('h1').first().textContent()) === heading, `nav → ${heading}`)
  }

  // deep link + hard refresh (the 404.html fallback path)
  await p.goto(BASE + 'projects/roman-ai-os', { waitUntil: 'networkidle' })
  ok((await p.locator('h1').first().textContent())?.includes('Roman AI OS'), 'deep link renders project detail')
  await p.reload({ waitUntil: 'networkidle' })
  ok((await p.locator('h1').first().textContent())?.includes('Roman AI OS'), 'hard refresh on deep link still works')
  await p.goto(BASE + 'activity', { waitUntil: 'networkidle' })
  ok((await p.locator('h1').first().textContent()) === 'Події', 'deep link /activity works')

  // service worker
  await p.goto(BASE, { waitUntil: 'networkidle' })
  const sw = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.ready
    return { active: !!r.active, scope: r.scope }
  })
  ok(sw.active, 'service worker active')
  ok(sw.scope === new URL(BASE).href, `SW scope correct (${sw.scope})`)

  // manifest
  const mf = await p.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href
    const m = await (await fetch(href)).json()
    const abs = (s) => new URL(s, href).pathname
    return { id: abs(m.id), scope: abs(m.scope), start: abs(m.start_url), display: m.display,
             icons: m.icons.map(i => abs(i.src)), maskable: m.icons.some(i => i.purpose?.includes('maskable')) }
  })
  const basePath = new URL(BASE).pathname
  ok(mf.scope === basePath, `manifest scope → ${mf.scope}`)
  ok(mf.start === basePath, `manifest start_url → ${mf.start}`)
  ok(mf.id === basePath, `manifest id → ${mf.id}`)
  ok(mf.display === 'standalone', 'display standalone')
  ok(mf.maskable, 'maskable icon declared')
  for (const src of mf.icons) {
    const st = await p.evaluate(async (u) => (await fetch(u)).status, src)
    ok(st === 200, `icon ${src} → ${st}`)
  }
  const apple = await p.evaluate(async () => {
    const el = document.querySelector('link[rel="apple-touch-icon"]')
    return { href: new URL(el.href).pathname, status: (await fetch(el.href)).status }
  })
  ok(apple.status === 200, `apple-touch-icon ${apple.href} → ${apple.status}`)

  if (label === 'iphone') {
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ok(overflow <= 1, `no horizontal overflow (${overflow}px)`)
    ok(await p.getByRole('navigation', { name: 'Розділи' }).isVisible(), 'mobile tab bar visible')
  }

  ok(errs.length === 0, `no console errors${errs.length ? ': ' + errs.join(' | ') : ''}`)
  await ctx.close()
}
await b.close()
console.log(fails ? `\nFAILED: ${fails}` : '\nALL PASSED')
process.exit(fails ? 1 : 0)
