import { Link, useParams } from 'react-router-dom'
import { useAdapters } from '@/ui/hooks/adapters'
import { useSourced } from '@/ui/hooks/useSourced'
import { AsyncSection, EmptyState } from '@/ui/components/States'
import { DataNotice } from '@/ui/components/DataNotice'
import { ProjectStatusBadge, SourceBadge } from '@/ui/components/Badges'
import { IconExternal } from '@/ui/components/Icons'
import { formatDate, formatRelative } from '@/ui/format'

export function ProjectDetailScreen() {
  const { projectId = '' } = useParams()
  const { projects, activity } = useAdapters()

  const query = useSourced(() => projects.getProject(projectId), [projects, projectId])
  const activityQuery = useSourced(
    () => activity.listEvents({ projectId }),
    [activity, projectId],
  )

  return (
    <div className="stack stack--loose">
      <Link to="/projects" style={{ fontSize: 'var(--text-sm)' }}>
        ← Усі проєкти
      </Link>

      <AsyncSection query={query} loadingRows={4}>
        {(result) => {
          const project = result.data
          if (!project) {
            return (
              <EmptyState
                title="Проєкт не знайдено"
                hint={`Немає зареєстрованого проєкту з id «${projectId}».`}
              />
            )
          }

          return (
            <div className="stack stack--loose">
              <div>
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <h1 className="page-heading" style={{ marginBottom: 0 }}>
                    {project.name}
                  </h1>
                  <ProjectStatusBadge status={project.status} />
                </div>
                <p className="page-intro" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
                  {project.shortDescription}
                </p>
              </div>

              <section className="card stack stack--tight">
                <span className="section-title">Поточна ціль</span>
                <p>{project.currentGoal}</p>
              </section>

              <section
                className="card stack stack--tight"
                style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
              >
                <span className="section-title">Наступний крок</span>
                <p style={{ fontWeight: 550 }}>{project.nextStep}</p>
              </section>

              <section className="stack stack--tight">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="section-title">Поточний стан (STATE)</h2>
                  <SourceBadge source="project-state" />
                </div>
                <div className="card stack stack--tight">
                  {project.currentState.map((line, i) => (
                    <p key={i} className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {line}
                    </p>
                  ))}
                </div>
              </section>

              <section className="stack stack--tight">
                <h2 className="section-title">Блокери ({project.blockers.length})</h2>
                {project.blockers.length === 0 ? (
                  <div className="card">
                    <p className="muted">Блокерів немає.</p>
                  </div>
                ) : (
                  <ul className="card card--flush list" style={{ listStyle: 'none' }}>
                    {project.blockers.map((b) => (
                      <li key={b.id} className="list__row">
                        <strong style={{ fontSize: 'var(--text-sm)' }}>{b.title}</strong>
                        <p className="muted" style={{ marginTop: 2 }}>
                          {b.detail}
                        </p>
                        <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                          <span className="badge badge--warn">чекає на: {b.waitingOn}</span>
                          <span className="muted mono" style={{ fontSize: 'var(--text-2xs)' }}>
                            з {formatDate(b.since)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(project.links.length > 0 || project.repoUrl || project.driveFolderUrl) && (
                <section className="stack stack--tight">
                  <h2 className="section-title">Канонічні джерела</h2>
                  <ul className="card card--flush list" style={{ listStyle: 'none' }}>
                    {project.links.map((link) => (
                      <li key={link.url}>
                        <a
                          className="list__row row"
                          href={link.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
                        >
                          <span style={{ fontSize: 'var(--text-sm)', minWidth: 0 }}>
                            {link.label}
                          </span>
                          <IconExternal
                            style={{ width: 16, height: 16, color: 'var(--text-muted)', flexShrink: 0 }}
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="stack stack--tight">
                <h2 className="section-title">Події проєкту</h2>
                <AsyncSection
                  query={activityQuery}
                  loadingRows={2}
                  isEmpty={(data) => data.length === 0}
                  emptyTitle="Подій для цього проєкту немає"
                >
                  {(events) => (
                    <ul className="card card--flush list" style={{ listStyle: 'none' }}>
                      {events.data.slice(0, 8).map((e) => (
                        <li key={e.id} className="list__row">
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <strong style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0 }}>
                              {e.title}
                            </strong>
                            <span className="muted mono" style={{ fontSize: 'var(--text-2xs)' }}>
                              {formatRelative(e.at)}
                            </span>
                          </div>
                          {e.detail && (
                            <p className="muted" style={{ marginTop: 2 }}>
                              {e.detail}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </AsyncSection>
              </section>

              <DataNotice
                origin={result.origin}
                source={result.sourceOfTruth}
                retrievedAt={result.retrievedAt}
              />
            </div>
          )
        }}
      </AsyncSection>
    </div>
  )
}
