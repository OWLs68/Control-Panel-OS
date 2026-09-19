import { Link } from 'react-router-dom'
import { useAdapters } from '@/ui/hooks/adapters'
import { useSourced } from '@/ui/hooks/useSourced'
import { AsyncSection } from '@/ui/components/States'
import { DataNotice } from '@/ui/components/DataNotice'
import { HealthDot, RiskBadge } from '@/ui/components/Badges'
import { IconChevron } from '@/ui/components/Icons'
import { formatDate, formatRelative } from '@/ui/format'
import type { HealthSignal, SystemHealth, WaitingItem } from '@/domain/types'

const LEVEL_COLOR: Record<string, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  error: 'var(--error)',
}

function SignalTile({ signal }: { signal: HealthSignal }) {
  return (
    <div className="card" style={{ padding: 'var(--space-3)' }}>
      <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 2 }}>
        <HealthDot level={signal.level} />
        <span className="section-title" style={{ letterSpacing: '0.04em' }}>
          {signal.label}
        </span>
      </div>
      <div
        className="mono"
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: LEVEL_COLOR[signal.level] ?? 'var(--text-primary)',
        }}
      >
        {signal.value}
      </div>
      {signal.detail && (
        <p className="muted" style={{ fontSize: 'var(--text-2xs)', marginTop: 2 }}>
          {signal.detail}
        </p>
      )}
    </div>
  )
}

function WaitingCard({ item }: { item: WaitingItem }) {
  return (
    <li className="list__row">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <strong style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0 }}>{item.title}</strong>
        {item.riskLevel && <RiskBadge level={item.riskLevel} />}
      </div>
      <p className="muted" style={{ marginTop: 2 }}>
        {item.reason}
      </p>
      <p className="muted mono" style={{ fontSize: 'var(--text-2xs)', marginTop: 4 }}>
        чекає з {formatDate(item.since)}
      </p>
    </li>
  )
}

function HealthOverview({ health }: { health: SystemHealth }) {
  return (
    <>
      <section
        className="card"
        style={{
          borderColor: LEVEL_COLOR[health.level] ?? 'var(--border)',
          background:
            health.level === 'ok'
              ? 'var(--ok-soft)'
              : health.level === 'error'
                ? 'var(--error-soft)'
                : 'var(--warn-soft)',
        }}
      >
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <HealthDot level={health.level} />
          <span className="section-title">Стан системи</span>
        </div>
        <p style={{ marginTop: 'var(--space-1)', fontWeight: 550 }}>{health.headline}</p>
      </section>

      {health.waitingForRoman.length > 0 && (
        <section className="stack stack--tight">
          <h2 className="section-title">Чекає на Романа ({health.waitingForRoman.length})</h2>
          <ul className="card card--flush list" style={{ listStyle: 'none' }}>
            {health.waitingForRoman.map((item) => (
              <WaitingCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      <section className="stack stack--tight">
        <h2 className="section-title">Сигнали</h2>
        <div className="grid-auto">
          {health.signals.map((signal) => (
            <SignalTile key={signal.id} signal={signal} />
          ))}
        </div>
      </section>

      {health.warnings.length > 0 && (
        <section className="stack stack--tight">
          <h2 className="section-title">Попередження ({health.warnings.length})</h2>
          <ul className="card card--flush list" style={{ listStyle: 'none' }}>
            {health.warnings.map((w) => (
              <li key={w.id} className="list__row">
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <HealthDot level={w.level} />
                  <strong style={{ fontSize: 'var(--text-sm)' }}>{w.title}</strong>
                </div>
                <p className="muted" style={{ marginTop: 2 }}>
                  {w.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export function Dashboard() {
  const { system, projects, activity, connections, backup } = useAdapters()

  const healthQuery = useSourced(() => system.getSystemHealth(), [system])
  const projectsQuery = useSourced(() => projects.listProjects(), [projects])
  const activityQuery = useSourced(() => activity.listEvents(), [activity])
  const connectionsQuery = useSourced(() => connections.listConnections(), [connections])
  const backupQuery = useSourced(() => backup.getBackupStatus(), [backup])

  const activeProjects = projectsQuery.result?.data.filter((p) => p.status === 'active') ?? []
  const recentEvents = activityQuery.result?.data.slice(0, 5) ?? []
  const liveConnections =
    connectionsQuery.result?.data.filter((c) => c.state === 'connected').length ?? 0
  const totalConnections = connectionsQuery.result?.data.length ?? 0

  return (
    <div className="stack stack--loose">
      <div>
        <h1 className="page-heading">Огляд системи</h1>
        <p className="page-intro">
          Проєкція стану Roman AI OS. Панель не є джерелом правди.
        </p>
      </div>

      <AsyncSection query={healthQuery} loadingRows={4}>
        {(result) => (
          <div className="stack stack--loose">
            <HealthOverview health={result.data} />
            <DataNotice
              origin={result.origin}
              source={result.sourceOfTruth}
              retrievedAt={result.retrievedAt}
            />
          </div>
        )}
      </AsyncSection>

      <section className="stack stack--tight">
        <h2 className="section-title">Активні проєкти</h2>
        <AsyncSection
          query={projectsQuery}
          loadingRows={2}
          isEmpty={(data) => data.filter((p) => p.status === 'active').length === 0}
          emptyTitle="Немає активних проєктів"
        >
          {(result) => (
            <>
              <ul className="card card--flush list" style={{ listStyle: 'none' }}>
                {activeProjects.map((p) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="list__row">
                      <div
                        className="row"
                        style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: 'var(--text-sm)' }}>{p.name}</strong>
                          <p className="muted" style={{ marginTop: 2 }}>
                            {p.nextStep}
                          </p>
                        </div>
                        <IconChevron
                          style={{ width: 18, height: 18, color: 'var(--text-muted)', flexShrink: 0 }}
                        />
                      </div>
                      {p.blockerCount > 0 && (
                        <span
                          className="badge badge--warn"
                          style={{ marginTop: 'var(--space-2)' }}
                        >
                          {p.blockerCount} блокер{p.blockerCount > 1 ? 'и' : ''}
                        </span>
                      )}
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
      </section>

      <section className="stack stack--tight">
        <h2 className="section-title">Підключення та backup</h2>
        <div className="grid-auto">
          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <span className="section-title" style={{ letterSpacing: '0.04em' }}>
              Підключення
            </span>
            <div className="mono" style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              {connectionsQuery.loading ? '—' : `${liveConnections} / ${totalConnections}`}
            </div>
            <p className="muted" style={{ fontSize: 'var(--text-2xs)', marginTop: 2 }}>
              активних інтеграцій
            </p>
          </div>
          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 2 }}>
              <HealthDot level={backupQuery.result?.data.level ?? 'unknown'} />
              <span className="section-title" style={{ letterSpacing: '0.04em' }}>
                Backup
              </span>
            </div>
            <div className="mono" style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              {backupQuery.result?.data.lastBackupAt
                ? formatRelative(backupQuery.result.data.lastBackupAt)
                : '—'}
            </div>
            <p className="muted" style={{ fontSize: 'var(--text-2xs)', marginTop: 2 }}>
              {backupQuery.result?.data.offDeviceCopy
                ? 'є копія поза пристроєм'
                : 'копії поза пристроєм немає'}
            </p>
          </div>
        </div>
      </section>

      <section className="stack stack--tight">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Останні події</h2>
          <Link to="/activity" style={{ fontSize: 'var(--text-xs)' }}>
            Усі події
          </Link>
        </div>
        <AsyncSection query={activityQuery} loadingRows={3} emptyTitle="Подій ще немає">
          {(result) => (
            <>
              <ul className="card card--flush list" style={{ listStyle: 'none' }}>
                {recentEvents.map((e) => (
                  <li key={e.id} className="list__row">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0 }}>
                        {e.title}
                      </strong>
                      <span className="muted mono" style={{ fontSize: 'var(--text-2xs)' }}>
                        {formatRelative(e.at)}
                      </span>
                    </div>
                    <p className="muted" style={{ marginTop: 2 }}>
                      {e.actor}
                    </p>
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
      </section>
    </div>
  )
}
