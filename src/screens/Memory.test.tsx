import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Memory } from './Memory'
import { renderApp } from '@/test-utils'

describe('Memory', () => {
  it('lists recent memory with provenance and lifecycle state', async () => {
    renderApp(<Memory />)

    await waitFor(() => {
      expect(screen.getByText(/AMBER-842/)).toBeInTheDocument()
    })
    expect(screen.getAllByText(/provenance:/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Активний').length).toBeGreaterThan(0)
  })

  it('narrows results with a recall query', async () => {
    const user = userEvent.setup()
    renderApp(<Memory />)

    await waitFor(() => expect(screen.getByText(/AMBER-842/)).toBeInTheDocument())

    await user.type(screen.getByRole('searchbox', { name: /Пошук/ }), 'backup')
    await user.click(screen.getByRole('button', { name: 'Знайти' }))

    await waitFor(() => {
      expect(screen.getByText(/Результати для «backup»/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/AMBER-842/)).not.toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup()
    renderApp(<Memory />)

    await waitFor(() => expect(screen.getByText(/AMBER-842/)).toBeInTheDocument())

    await user.type(screen.getByRole('searchbox', { name: /Пошук/ }), 'zzz-nothing')
    await user.click(screen.getByRole('button', { name: 'Знайти' }))

    await waitFor(() => {
      expect(screen.getByText('Нічого не знайдено')).toBeInTheDocument()
    })
  })

  it('marks memory verbs that the current adapter does not implement', async () => {
    renderApp(<Memory />)

    await waitFor(() => expect(screen.getByText('recall')).toBeInTheDocument())

    // `remember` and `forget` are write verbs; a read-only panel must say so.
    expect(screen.getByText('remember')).toBeInTheDocument()
    expect(screen.getAllByText('не підключений').length).toBeGreaterThanOrEqual(4)
  })
})
