import { expect, test } from '@playwright/test'

test.describe('Control Panel shell', () => {
  test('loads the dashboard with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'Огляд системи' })).toBeVisible()
    await expect(page.getByText('Стан системи')).toBeVisible()
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([])
  })

  test('navigates through every section', async ({ page }) => {
    await page.goto('/')

    const sections: [string, string][] = [
      ['Проєкти', 'Проєкти'],
      ['Памʼять', 'Памʼять'],
      ['Агенти', 'Агенти / AI-клієнти'],
      ['Події', 'Події'],
      ['Налашт', 'Налаштування'],
    ]

    for (const [navLabel, heading] of sections) {
      // Both navs are in the DOM; only the one for this viewport is visible.
      await page.locator('a:visible', { hasText: navLabel }).first().click()
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    }
  })

  test('drills into a project and back', async ({ page }) => {
    await page.goto('/projects')

    await page.getByRole('link', { name: /Roman AI OS \/ GBrain/ }).click()
    await expect(page.getByText('Наступний крок')).toBeVisible()
    await expect(page.getByText('Поточний стан (STATE)')).toBeVisible()
    await expect(page.getByText('Блокери', { exact: false })).toBeVisible()

    await page.getByRole('link', { name: '← Усі проєкти' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Проєкти' })).toBeVisible()
  })

  test('always labels the data source as mock', async ({ page }) => {
    await page.goto('/')
    // The shell badge exists in both the topbar and the sidebar; exactly one
    // is visible at any viewport, and it must read MOCK.
    const shellBadge = page.locator('[data-testid="shell-origin"]:visible')
    await expect(shellBadge).toHaveCount(1)
    await expect(shellBadge.getByTestId('origin-mock')).toBeVisible()

    await page.goto('/settings')
    await expect(page.getByTestId('data-source-mode')).toHaveText('mock')
  })

  test('recall search filters memory', async ({ page }) => {
    await page.goto('/memory')
    await expect(page.getByText(/AMBER-842/)).toBeVisible()

    await page.getByRole('searchbox', { name: /Пошук/ }).fill('backup')
    await page.getByRole('button', { name: 'Знайти' }).click()

    await expect(page.getByText(/Результати для «backup»/)).toBeVisible()
    await expect(page.getByText(/AMBER-842/)).toHaveCount(0)
  })

  test('activity filter chips narrow the feed', async ({ page }) => {
    await page.goto('/activity')
    const rows = page.locator('.list__row')
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeGreaterThan(3)

    await page.getByRole('button', { name: 'Backup', exact: true }).click()
    await expect(rows).toHaveCount(1)
  })
})

test.describe('layout', () => {
  test('never scrolls horizontally', async ({ page }) => {
    for (const path of ['/', '/projects', '/memory', '/agents', '/activity', '/settings']) {
      await page.goto(path)
      await page.waitForTimeout(200)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1)
    }
  })

  test('interactive controls meet the 44px touch target minimum', async ({ page }) => {
    test.skip(test.info().project.name !== 'iphone', 'touch targets matter on mobile')

    await page.goto('/')
    const tabs = page.locator('.tabbar__item')
    const count = await tabs.count()
    expect(count).toBe(6)

    for (let i = 0; i < count; i++) {
      const box = await tabs.nth(i).boundingBox()
      expect(box, 'tab has no box').not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('mobile shows the tab bar, desktop shows the sidebar', async ({ page }) => {
    await page.goto('/')
    const isMobile = test.info().project.name === 'iphone'

    const tabbar = page.getByRole('navigation', { name: 'Розділи' })
    const sidebar = page.getByRole('navigation', { name: 'Основна навігація' })

    if (isMobile) {
      await expect(tabbar).toBeVisible()
      await expect(sidebar).toBeHidden()
    } else {
      await expect(sidebar).toBeVisible()
      await expect(tabbar).toBeHidden()
    }
  })
})
