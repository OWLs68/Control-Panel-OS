import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { renderApp } from '@/test-utils'

describe('App navigation', () => {
  it('opens on the dashboard', async () => {
    renderApp(<App />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Огляд системи' })).toBeInTheDocument()
    })
  })

  it('navigates between sections through the tab bar', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    const tabbar = screen.getByRole('navigation', { name: 'Розділи' })

    await user.click(within(tabbar).getByRole('link', { name: /Проєкти/ }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Проєкти' })).toBeInTheDocument()
    })

    await user.click(within(tabbar).getByRole('link', { name: /Агенти/ }))
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Агенти / AI-клієнти' }),
      ).toBeInTheDocument()
    })

    await user.click(within(tabbar).getByRole('link', { name: /Налашт/ }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Налаштування' })).toBeInTheDocument()
    })
  })

  it('drills from the project list into a project detail view', async () => {
    const user = userEvent.setup()
    renderApp(<App />, { route: '/projects' })

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Control Panel PWA/ })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: /Control Panel PWA/ }))

    await waitFor(() => {
      expect(screen.getByText('Наступний крок')).toBeInTheDocument()
    })
    expect(screen.getByText('Поточний стан (STATE)')).toBeInTheDocument()
  })

  it('shows a not-found screen for an unknown project id', async () => {
    renderApp(<App />, { route: '/projects/nope' })
    await waitFor(() => {
      expect(screen.getByText('Проєкт не знайдено')).toBeInTheDocument()
    })
  })

  it('shows a not-found screen for an unknown route', async () => {
    renderApp(<App />, { route: '/nowhere' })
    await waitFor(() => {
      expect(screen.getByText('Сторінку не знайдено')).toBeInTheDocument()
    })
  })
})
