import { createContext, useContext } from 'react'
import type { AdapterRegistry } from '@/adapters'

export const AdapterContext = createContext<AdapterRegistry | null>(null)

/** Screens read their data source from here and never import an adapter directly. */
export function useAdapters(): AdapterRegistry {
  const adapters = useContext(AdapterContext)
  if (!adapters) {
    throw new Error('useAdapters must be used inside <AdapterProvider>')
  }
  return adapters
}
