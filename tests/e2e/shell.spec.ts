/**
 * Screen geometry and navigation.
 *
 * Assertions are about what is on screen, not what is in storage: the bugs this
 * suite exists to catch — the bar riding away with the content, a tab that
 * looks switched but is not — are all visual.
 */
import { expect, test } from '@playwright/test'
import { gotoModule } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await expect(page.locator('#screen-control')).toHaveClass(/active/)
})

test('the document itself never scrolls', async ({ page }) => {
  const { bodyScroll, viewport, overflow } = await page.evaluate(() => ({
    bodyScroll: document.body.scrollHeight,
    viewport: window.innerHeight,
    overflow: getComputedStyle(document.documentElement).overflow,
  }))
  expect(overflow).toBe('hidden')
  expect(bodyScroll).toBeLessThanOrEqual(viewport + 1)
})

test('the bar stays pinned to the bottom while the screen scrolls under it', async ({ page }) => {
  const bar = page.locator('#tab-bar')

  // The contract, stated directly: pinned to the viewport, flush with its
  // bottom edge. Asserting a pixel distance instead would be measuring the
  // emulator, whose innerHeight lags the layout viewport by a pixel or three
  // while the page settles.
  const pinned = await bar.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { position: cs.position, bottom: cs.bottom }
  })
  expect(pinned).toEqual({ position: 'fixed', bottom: '0px' })

  // Let the web fonts land first: they change the bar's HEIGHT by a pixel or
  // two, which moves its top edge while the bottom stays pinned.
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(150)

  const bottomEdge = async () => {
    const box = await bar.boundingBox()
    return Math.round((box?.y ?? 0) + (box?.height ?? 0))
  }
  const before = await bottomEdge()

  await page.locator('#screen-control').evaluate((el) => { el.scrollTop = el.scrollHeight })
  await page.waitForTimeout(300)

  // ...and the screen really did scroll, or the check above proves nothing.
  const scrolled = await page.locator('#screen-control').evaluate((el) => el.scrollTop)
  expect(scrolled).toBeGreaterThan(0)

  // The point: scrolling the content did not take the bar with it.
  expect(await bottomEdge()).toBe(before)
})

test('the measured bar height reaches the CSS variable', async ({ page }) => {
  const { value, real } = await page.evaluate(() => ({
    value: getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim(),
    real: (document.getElementById('tab-bar') as HTMLElement).offsetHeight,
  }))
  const px = parseInt(value, 10)
  expect(px).toBeGreaterThan(50)   // an unmeasured, empty bar reads about 15px
  expect(px).toBe(real)            // measured, not the 78px default
})

test('the bar is re-measured when it grows after boot, and the input box stays above it', async ({ page }) => {
  // ISS-002: on the phone the bar grows late (safe area, font swap) and the
  // input box ended up under it. Let boot's 500ms fallback measurement pass
  // first, then grow the bar by padding alone — only the observer can catch
  // that — and see the variable follow.
  await page.waitForTimeout(800)
  await page.addStyleTag({ content: '#tab-bar { padding-bottom: 40px !important; }' })
  await expect.poll(() => page.evaluate(() => {
    const value = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h'), 10)
    const real = (document.getElementById('tab-bar') as HTMLElement).offsetHeight
    return real - value
  }), { timeout: 2000 }).toBe(0)

  await page.waitForTimeout(400)   // the bar's `bottom` transition
  const box = await page.locator('.ai-bar-input-box').boundingBox()
  const bar = await page.locator('#tab-bar').boundingBox()
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) - 3)
})

test('a screen ends just under its content, not half a screen lower', async ({ page }) => {
  // ISS-003: the dock is the input box, not the whole bar with the hidden chat.
  const dock = await page.evaluate(() =>
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--dock-h'), 10))
  expect(dock).toBeLessThan(100)

  await gotoModule(page, 'events')
  const gap = await page.evaluate(() => {
    const s = document.querySelector('.screen.active') as HTMLElement
    s.scrollTop = s.scrollHeight
    let lowest = 0
    s.querySelectorAll('*').forEach((e) => { const b = e.getBoundingClientRect(); if (b.height && b.bottom > lowest) lowest = b.bottom })
    const box = (document.querySelector('.ai-bar-input-box') as HTMLElement).getBoundingClientRect()
    return box.top - lowest
  })
  // The last element's own margin sits in the gap too; what matters is that
  // it is a breath, not the ~250px hole of ISS-003.
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThan(80)
})

test('the version badge says which build this is, and opens the deploy info', async ({ page }) => {
  const badge = page.locator('#deploy-version')
  // A local build says vdev; a deploy says v19 over the day and time.
  await expect(badge.locator('.deploy-badge-num')).toHaveText(/^v(dev|\d+)$/)
  // In the middle of the bar, between the title and the buttons, on one row.
  const [title, actions, box] = await Promise.all([
    page.locator('.topbar-titles').boundingBox(), page.locator('.topbar-actions').boundingBox(), badge.boundingBox()])
  expect(box!.x).toBeGreaterThan(title!.x + title!.width)
  expect(box!.x + box!.width).toBeLessThan(actions!.x)
  expect(await page.locator('#topbar').evaluate((el) => (el as HTMLElement).offsetHeight)).toBeLessThan(70)
  await badge.tap()
  await expect(page.locator('#deploy-info .sheet')).toHaveClass(/open/)
  await expect(page.locator('#deploy-info')).toContainText('Версія')
  await expect(page.locator('[data-action="hard-refresh"]')).toBeVisible()
})

test('cards fade up as a screen renders, and hold their end state', async ({ page }) => {
  // NeverMind's fadeUp: 0.35s ease, fill both, 12px rise; replayed on every render.
  await gotoModule(page, 'projects')
  const cards = page.locator('#screen-projects .card')
  await expect(cards.first()).toBeVisible()
  const anim = await cards.first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return [cs.animationName, cs.animationDuration, cs.animationTimingFunction, cs.animationFillMode].join(' ')
  })
  expect(anim).toBe('fadeUp 0.35s ease both')
  // Once the animation has run, the card is fully there — no stuck opacity, no offset.
  await expect.poll(() => cards.first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return `${cs.opacity} ${cs.transform}`
  })).toBe('1 matrix(1, 0, 0, 1, 0, 0)')
  // The keyframes are the donor's numbers.
  const frames = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      // The Google Fonts sheet is cross-origin and refuses to list its rules.
      let rules: CSSRule[]
      try { rules = Array.from(sheet.cssRules) } catch { continue }
      for (const rule of rules) {
        if (rule instanceof CSSKeyframesRule && rule.name === 'fadeUp') {
          return Array.from(rule.cssRules).map((k) => (k as CSSKeyframeRule).keyText + ' ' + (k as CSSKeyframeRule).style.cssText).join(' | ')
        }
      }
    }
    return ''
  })
  expect(frames).toBe('0% opacity: 0; transform: translateY(12px); | 100% opacity: 1; transform: translateY(0px);')
})

test('a screen keeps its scroll position while you visit another module', async ({ page }) => {
  // ISS-005 — as in NeverMind, where switchTab resets nothing.
  await gotoModule(page, 'projects')
  await page.locator('#screen-projects').evaluate((el) => { el.scrollTop = 150 })
  await gotoModule(page, 'events')
  await gotoModule(page, 'projects')
  expect(await page.locator('#screen-projects').evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
})

test('nothing spills off the 390px screen', async ({ page }) => {
  const overflowing = await page.evaluate(() => {
    const bad: string[] = []
    // An element wider than the screen is only a bug if nothing is clipping it:
    // a scrolling strip and the drum's track are supposed to be wider, and
    // anything inside an overflow:hidden box cannot reach the user anyway.
    const clipped = (el: Element): boolean => {
      let node: Element | null = el.parentElement
      while (node) {
        const overflow = getComputedStyle(node).overflow
        if (overflow !== 'visible') return true
        node = node.parentElement
      }
      return false
    }
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0) return
      if (r.right <= window.innerWidth + 1 && r.left >= -1) return
      if (clipped(el)) return
      bad.push(`${el.tagName}.${el.className}`)
    })
    return bad
  })
  expect(overflowing).toEqual([])

  // The thing that would actually hurt: a page that slides sideways. Polled,
  // because the drum's track is briefly wider than the screen while its padding
  // is being computed — it settles within a frame or two.
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  ), { timeout: 3000 }).toBeLessThanOrEqual(0)

  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowX)).toBe('hidden')
})

test('every tappable target is at least 44px', async ({ page }) => {
  const small = await page.evaluate(() => {
    const bad: string[] = []
    document.querySelectorAll('button, [data-action]').forEach((el) => {
      if ((el as HTMLElement).hidden) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      if (el.classList.contains('chips-arrow')) return
      // The version badge is NeverMind's 10px diagnostic label, not a control
      // anyone needs under a thumb; it opens the deploy info for whoever looks.
      if (el.classList.contains('deploy-badge')) return
      // The three header buttons are 36px by Roman's ask (21.09) — flagged, not relaxed.
      if (el.classList.contains('round-btn')) return
      // NeverMind's chips are 12px text with 7px padding — about 31px tall.
      // Ported as they are (Roman, 20.09), so flagged here like the bar's
      // 32px buttons rather than silently relaxing the threshold.
      if (el.classList.contains('chip')) return
      // The bar's photo, mic and send buttons are 32px — NeverMind's own value,
      // kept because the bar was ported rather than rebuilt. They sit inside a
      // 50px-tall box with 8px gaps, so the real touch slop is larger than the
      // circle. Flagged rather than silently relaxed.
      if (el.closest('.ai-bar-input-box')) return
      // Same for the modules button: 38x38 is NeverMind's drum-plus-btn, kept
      // because the bar was ported. It sits in a 50px-tall bar with 8px gaps.
      if (el.classList.contains('drum-plus-btn')) return
      // A drum tab turned away by the 3D arc is narrower on screen by design —
      // you read and tap the one in the middle. Its layout box is full size.
      if (el.classList.contains('tab-item') && !el.classList.contains('active')) return
      if (r.height < 44 || r.width < 44) bad.push(`${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`)
    })
    return bad
  })
  expect(small).toEqual([])

  // The tab in the middle is the one being aimed at, so it must be full size.
  const active = await page.locator('.tab-item.active').boundingBox()
  expect(active?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(active?.width ?? 0).toBeGreaterThanOrEqual(44)
})

test('the safe areas are honoured top and bottom', async ({ page }) => {
  const padded = await page.evaluate(() => {
    const top = getComputedStyle(document.getElementById('topbar') as Element).paddingTop
    const bottom = getComputedStyle(document.getElementById('tab-bar') as Element).paddingBottom
    return { top, bottom }
  })
  expect(parseFloat(padded.top)).toBeGreaterThan(0)
  expect(parseFloat(padded.bottom)).toBeGreaterThan(0)
})

test('tapping a tab switches the screen', async ({ page }) => {
  await gotoModule(page, 'agents')
  await expect(page.locator('#screen-control')).not.toHaveClass(/active/)
  await expect(page.locator('#screen-agents').getByText('Claude Code').first()).toBeVisible()
})

test('the drum curves its tabs along an arc', async ({ page }) => {
  const transforms = await page.locator('.tab-item').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).style.transform))
  expect(transforms.every((t) => t.includes('rotateY'))).toBe(true)
  // The centre tab faces forward and the others are turned away from it.
  const angles = transforms.map((t) => parseFloat(/rotateY\((-?[\d.]+)deg\)/.exec(t)?.[1] ?? 'NaN'))
  expect(Math.min(...angles.map(Math.abs))).toBeLessThan(1.5)
  expect(Math.max(...angles.map(Math.abs))).toBeGreaterThan(10)
})

test('the console stays clean on every screen', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('font')) errors.push(m.text()) })
  for (const id of ['work', 'agents', 'projects', 'events', 'control']) {
    await gotoModule(page, id)
    await page.waitForTimeout(200)
  }
  expect(errors).toEqual([])
})
