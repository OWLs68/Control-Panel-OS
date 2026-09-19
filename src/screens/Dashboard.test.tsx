import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import { renderApp } from '@/test-utils'
import type { SystemAdapter } from '@/adapters/types'

describe('Dashboard', () => {
  it('shows the system headline and the waiting-for-Roman queue', async () => {
    renderApp(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText(/Чекає на Романа/)).toBeInTheDocument()
    })

    expect(screen.getByText(/Підключити зовнішній диск/)).toBeInTheDocument()
    // The risk level of a gated action must be visible, not implied.
    expect(screen.getAllByText('L3').length).toBeGreaterThan(0)
  })

  it('labels the data as mock so demo values are never mistaken for live ones', async () => {
    renderApp(<Dashboard />)
    await waitFor(() => {
      expect(screen.getAllByTestId('origin-mock').length).toBeGreaterThan(0)
    })
  })

  it('surfaces warnings rather than hiding them behind a healthy summary', async () => {
    renderApp(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText(/Попередження/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Спільний Bearer credential/)).toBeInTheDocument()
  })

  it('renders an error state with a retry when the adapter fails', async () => {
    const failing: SystemAdapter = {
      getSystemHealth: () => Promise.reject(new Error('gateway unreachable')),
    }

    renderApp(<Dashboard />, { adapters: { system: failing } })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText('gateway unreachable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Спробувати ще раз/ })).toBeInTheDocument()
  })
})
