import type { ReactNode } from 'react'
import type { AdapterRegistry } from '@/adapters'
import { AdapterContext } from './adapters'

/** Injects the adapter registry. Tests pass a stub registry through `value`. */
export function AdapterProvider({
  value,
  children,
}: {
  value: AdapterRegistry
  children: ReactNode
}) {
  return <AdapterContext.Provider value={value}>{children}</AdapterContext.Provider>
}
