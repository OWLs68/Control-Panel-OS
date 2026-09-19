import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdapterProvider } from '@/ui/hooks/AdapterProvider'
import { mockAdapters } from '@/adapters/mock'
import type { AdapterRegistry } from '@/adapters'

export interface TestRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Override individual adapters to exercise error / empty states. */
  adapters?: Partial<AdapterRegistry>
  route?: string
}

export function renderApp(ui: ReactElement, options: TestRenderOptions = {}) {
  const { adapters, route = '/', ...rest } = options
  const registry: AdapterRegistry = { ...mockAdapters, ...adapters }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AdapterProvider value={registry}>{children}</AdapterProvider>
      </MemoryRouter>
    )
  }

  return render(ui, { wrapper: Wrapper, ...rest })
}

export { mockAdapters }
