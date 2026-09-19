import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sourced } from '@/domain/types'

export interface SourcedQuery<T> {
  result: Sourced<T> | null
  loading: boolean
  error: Error | null
  reload: () => void
}

interface Snapshot<T> {
  /** The dependency values this snapshot was produced for. */
  deps: readonly unknown[]
  result: Sourced<T> | null
  error: Error | null
}

/** Reference-identity comparison, matching how React compares effect deps. */
function depsChanged(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]))
}

/**
 * Runs an adapter call and tracks loading / error / result.
 *
 * Deliberately small: the panel is read-mostly and does not need a data-fetching
 * library yet. `deps` behaves like a `useEffect` dependency list.
 *
 * `loading` is derived rather than stored — a snapshot carries the deps it was
 * produced for, so a dependency change makes the hook report loading on the
 * very same render, with no state update inside the effect.
 */
export function useSourced<T>(
  fetcher: () => Promise<Sourced<T>>,
  deps: readonly unknown[] = [],
): SourcedQuery<T> {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null)
  const [nonce, setNonce] = useState(0)

  const currentDeps = [...deps, nonce]

  // Keep the latest fetcher without making it a dependency, so callers can pass
  // an inline arrow function without re-running on every render.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let cancelled = false
    const runDeps = currentDeps

    fetcherRef
      .current()
      .then((value) => {
        if (!cancelled) setSnapshot({ deps: runDeps, result: value, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSnapshot({
            deps: runDeps,
            result: null,
            error: err instanceof Error ? err : new Error(String(err)),
          })
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, currentDeps)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const loading = snapshot === null || depsChanged(snapshot.deps, currentDeps)

  return {
    result: loading ? null : snapshot.result,
    loading,
    error: loading ? null : snapshot.error,
    reload,
  }
}
