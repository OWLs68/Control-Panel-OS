import type { ReactNode } from 'react'
import type { Sourced } from '@/domain/types'
import type { SourcedQuery } from '@/ui/hooks/useSourced'
import { IconAlert } from './Icons'

export function LoadingState({ label = 'Завантаження…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 72 }} aria-hidden="true" />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <IconAlert style={{ width: 28, height: 28, color: 'var(--error)' }} />
      <p className="state__title">Не вдалося завантажити дані</p>
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" className="btn btn--sm" onClick={onRetry}>
          Спробувати ще раз
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="state">
      <p className="state__title">{title}</p>
      {hint && <p>{hint}</p>}
    </div>
  )
}

/**
 * Renders the three states of an adapter call in one place so no screen has to
 * re-implement loading / error / empty handling.
 */
export function AsyncSection<T>({
  query,
  children,
  loadingRows,
  isEmpty,
  emptyTitle = 'Порожньо',
  emptyHint,
}: {
  query: SourcedQuery<T>
  children: (result: Sourced<T>) => ReactNode
  loadingRows?: number
  isEmpty?: (data: T) => boolean
  emptyTitle?: string
  emptyHint?: string
}) {
  if (query.loading) return <LoadingState rows={loadingRows} />
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.result) return <EmptyState title={emptyTitle} hint={emptyHint} />
  if (isEmpty?.(query.result.data)) return <EmptyState title={emptyTitle} hint={emptyHint} />
  return <>{children(query.result)}</>
}
