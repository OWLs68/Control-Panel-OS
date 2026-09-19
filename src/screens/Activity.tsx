import { useMemo, useState } from 'react'
import { useAdapters } from '@/ui/hooks/adapters'
import { useSourced } from '@/ui/hooks/useSourced'
import { AsyncSection } from '@/ui/components/States'
import { DataNotice } from '@/ui/components/DataNotice'
import { formatDateTime, formatRelative } from '@/ui/format'
import type { ActivityKind } from '@/domain/types'

const KIND_LABEL: Record<ActivityKind, string> = {
  'project-checkpoint': 'Checkpoint',
  'memory-write': 'Запис памʼяті',
  'memory-correction': 'Корекція памʼяті',
  'agent-action': 'Дія агента',
  'integration-change': 'Зміна інтеграції',
  backup: 'Backup',
  error: 'Помилка',
  decision: 'Рішення',
  'task-completed': 'Задача завершена',
}

const KIND_CLASS: Partial<Record<ActivityKind, string>> = {
  error: 'badge--error',
  decision: 'badge--accent',
  backup: 'badge--ok',
  'task-completed': 'badge--ok',
  'memory-correction': 'badge--warn',
}

const KINDS = Object.keys(KIND_LABEL) as ActivityKind[]

export function Activity() {
  const { activity } = useAdapters()
  const [selected, setSelected] = useState<ActivityKind | null>(null)
  const [search, setSearch] = useState('')

  const filter = useMemo(
    () => ({
      kinds: selected ? [selected] : undefined,
      search: search.trim() || undefined,
    }),
    [selected, search],
  )

  const query = useSourced(() => activity.listEvents(filter), [activity, filter])

  return (
    <div className="stack stack--loose">
      <div>
        <h1 className="page-heading">Події</h1>
        <p className="page-intro">
          Єдина стрічка того, що сталося в системі.
        </p>
      </div>

      <div className="stack stack--tight">
        <label htmlFor="activity-search" className="visually-hidden">
          Пошук у подіях
        </label>
        <input
          id="activity-search"
          className="input"
          type="search"
          placeholder="Пошук у подіях…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="chipbar" role="group" aria-label="Фільтр за типом події">
          <button
            type="button"
            className={`badge ${selected === null ? 'badge--accent' : 'badge--outline'}`}
            style={{ minHeight: 32, paddingInline: 'var(--space-3)' }}
            aria-pressed={selected === null}
            onClick={() => setSelected(null)}
          >
            Усі
          </button>
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`badge ${selected === kind ? 'badge--accent' : 'badge--outline'}`}
              style={{ minHeight: 32, paddingInline: 'var(--space-3)' }}
              aria-pressed={selected === kind}
              onClick={() => setSelected(selected === kind ? null : kind)}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>

      <AsyncSection
        query={query}
        loadingRows={5}
        isEmpty={(data) => data.length === 0}
        emptyTitle="Подій не знайдено"
        emptyHint="Спробуйте інший фільтр або очистіть пошук."
      >
        {(result) => (
          <>
            <ul className="card card--flush list" style={{ listStyle: 'none' }}>
              {result.data.map((e) => (
                <li key={e.id} className="list__row">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className={`badge ${KIND_CLASS[e.kind] ?? 'badge--outline'}`}>
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span
                      className="muted mono"
                      style={{ fontSize: 'var(--text-2xs)' }}
                      title={formatDateTime(e.at)}
                    >
                      {formatRelative(e.at)}
                    </span>
                  </div>
                  <strong style={{ fontSize: 'var(--text-sm)', display: 'block', marginTop: 4 }}>
                    {e.title}
                  </strong>
                  {e.detail && (
                    <p className="muted" style={{ marginTop: 2 }}>
                      {e.detail}
                    </p>
                  )}
                  <p
                    className="muted mono"
                    style={{ fontSize: 'var(--text-2xs)', marginTop: 'var(--space-2)' }}
                  >
                    {e.actor}
                    {e.projectId ? ` · ${e.projectId}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            <DataNotice
              origin={result.origin}
              source={result.sourceOfTruth}
              retrievedAt={result.retrievedAt}
              note="Стрічка зводить події з кількох джерел."
            />
          </>
        )}
      </AsyncSection>
    </div>
  )
}
