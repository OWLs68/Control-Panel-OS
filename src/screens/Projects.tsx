import { Link } from 'react-router-dom'
import { useAdapters } from '@/ui/hooks/adapters'
import { useSourced } from '@/ui/hooks/useSourced'
import { AsyncSection } from '@/ui/components/States'
import { DataNotice } from '@/ui/components/DataNotice'
import { ProjectStatusBadge } from '@/ui/components/Badges'
import { IconChevron } from '@/ui/components/Icons'
import { formatRelative } from '@/ui/format'
import type { ProjectStatus } from '@/domain/types'

/** Status order for the list: what needs attention first. */
const STATUS_ORDER: Record<ProjectStatus, number> = {
  active: 0,
  'watch-only': 1,
  paused: 2,
  closed: 3,
}

export function Projects() {
  const { projects } = useAdapters()
  const query = useSourced(() => projects.listProjects(), [projects])

  return (
    <div className="stack stack--loose">
      <div>
        <h1 className="page-heading">Проєкти</h1>
        <p className="page-intro">
          Зареєстровані проєкти. Поточний стан кожного походить зі STATE.md.
        </p>
      </div>

      <AsyncSection
        query={query}
        loadingRows={4}
        isEmpty={(data) => data.length === 0}
        emptyTitle="Немає зареєстрованих проєктів"
        emptyHint="Проєкт стає керованим лише після явної реєстрації."
      >
        {(result) => (
          <>
            <ul className="card card--flush list" style={{ listStyle: 'none' }}>
              {[...result.data]
                .sort(
                  (a, b) =>
                    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
                    b.lastUpdate.localeCompare(a.lastUpdate),
                )
                .map((p) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="list__row">
                      <div
                        className="row"
                        style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="row" style={{ gap: 'var(--space-2)' }}>
                            <strong style={{ fontSize: 'var(--text-base)' }}>{p.name}</strong>
                            <ProjectStatusBadge status={p.status} />
                            {p.blockerCount > 0 && (
                              <span className="badge badge--warn">
                                {p.blockerCount} блокер{p.blockerCount > 1 ? 'и' : ''}
                              </span>
                            )}
                          </div>
                          <p className="muted" style={{ marginTop: 'var(--space-1)' }}>
                            {p.currentGoal}
                          </p>
                          <p
                            className="muted mono"
                            style={{ fontSize: 'var(--text-2xs)', marginTop: 'var(--space-2)' }}
                          >
                            оновлено {formatRelative(p.lastUpdate)}
                          </p>
                        </div>
                        <IconChevron
                          style={{
                            width: 18,
                            height: 18,
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                            alignSelf: 'center',
                          }}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
            <DataNotice
              origin={result.origin}
              source={result.sourceOfTruth}
              retrievedAt={result.retrievedAt}
            />
          </>
        )}
      </AsyncSection>
    </div>
  )
}
