/**
 * Adapter selection.
 *
 * `VITE_DATA_SOURCE` decides which implementation the app runs against. Only
 * `mock` exists today; `gateway` is the seam a real thin backend plugs into,
 * and it deliberately throws rather than silently falling back to mock data —
 * a panel that quietly shows fixtures while claiming to be live would be worse
 * than one that refuses to start.
 */
import type { AdapterRegistry } from './types'
import { mockAdapters } from './mock'

export type DataSourceMode = 'mock' | 'gateway'

export function resolveDataSourceMode(): DataSourceMode {
  const raw = import.meta.env?.VITE_DATA_SOURCE
  return raw === 'gateway' ? 'gateway' : 'mock'
}

export function createAdapters(mode: DataSourceMode = resolveDataSourceMode()): AdapterRegistry {
  if (mode === 'gateway') {
    throw new Error(
      'VITE_DATA_SOURCE=gateway: the Roman AI OS gateway adapter is not implemented yet. ' +
        'Set VITE_DATA_SOURCE=mock, or implement AdapterRegistry against the gateway.',
    )
  }
  return mockAdapters
}

export type { AdapterRegistry } from './types'
