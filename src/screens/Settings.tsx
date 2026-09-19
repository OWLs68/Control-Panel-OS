import { useAdapters } from '@/ui/hooks/adapters'
import { useSourced } from '@/ui/hooks/useSourced'
import { useTheme, type ThemePreference } from '@/ui/hooks/useTheme'
import { AsyncSection } from '@/ui/components/States'
import { DataNotice } from '@/ui/components/DataNotice'
import { ConnectionStateBadge, HealthDot } from '@/ui/components/Badges'
import { formatDateTime, formatRelative } from '@/ui/format'
import { resolveDataSourceMode } from '@/adapters'
import type { ReactNode } from 'react'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="stack stack--tight">
      <h2 className="section-title">{title}</h2>
      {description && <p className="muted">{description}</p>}
      {children}
    </section>
  )
}

/** A settings row that exists as a placeholder for a not-yet-built subsystem. */
function PlannedRow({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="list__row row" style={{ justifyContent: 'space-between', gap: 'var(--space-3)' }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 'var(--text-sm)' }}>{label}</strong>
        <p className="muted" style={{ marginTop: 2 }}>
          {detail}
        </p>
      </div>
      <span className="badge badge--outline">Заплановано</span>
    </li>
  )
}

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Системна' },
  { value: 'light', label: 'Світла' },
  { value: 'dark', label: 'Темна' },
]

export function Settings() {
  const { connections, backup, agents } = useAdapters()
  const [theme, setTheme] = useTheme()

  const connectionsQuery = useSourced(() => connections.listConnections(), [connections])
  const backupQuery = useSourced(() => backup.getBackupStatus(), [backup])
  const agentsQuery = useSourced(() => agents.listAgents(), [agents])

  const mode = resolveDataSourceMode()

  return (
    <div className="stack stack--loose">
      <div>
        <h1 className="page-heading">Налаштування</h1>
        <p className="page-intro">
          Огляд конфігурації. Панель нічого не змінює в системі.
        </p>
      </div>

      <Section
        title="Connections"
        description="Інтеграції та їхня роль. Джерело правди — сама система, не панель."
      >
        <AsyncSection query={connectionsQuery} loadingRows={3} emptyTitle="Підключень немає">
          {(result) => (
            <>
              <ul className="card card--flush list" style={{ listStyle: 'none' }}>
                {result.data.map((c) => (
                  <li key={c.id} className="list__row">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 'var(--text-sm)' }}>{c.name}</strong>
                      <ConnectionStateBadge state={c.state} />
                    </div>
                    <p className="muted" style={{ marginTop: 2 }}>
                      {c.role}
                    </p>
                    <p className="muted mono" style={{ fontSize: 'var(--text-2xs)', marginTop: 4 }}>
                      {c.detail}
                    </p>
                    {c.sharedCredentialWarning && (
                      <div
                        className="badge badge--warn"
                        style={{
                          whiteSpace: 'normal',
                          textAlign: 'start',
                          lineHeight: 1.4,
                          marginTop: 'var(--space-2)',
                        }}
                      >
                        {c.sharedCredentialWarning}
                      </div>
                    )}
                    <p className="muted mono" style={{ fontSize: 'var(--text-2xs)', marginTop: 4 }}>
                      перевірено {formatRelative(c.lastChecked)}
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
      </Section>

      <Section
        title="AI providers та моделі"
        description="Які провайдери зараз обслуговують агентів."
      >
        <AsyncSection query={agentsQuery} loadingRows={2} emptyTitle="Агентів немає">
          {(result) => (
            <ul className="card card--flush list" style={{ listStyle: 'none' }}>
              {result.data
                .filter((a) => a.provider)
                .map((a) => (
                  <li
                    key={a.id}
                    className="list__row row"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span style={{ fontSize: 'var(--text-sm)' }}>{a.name}</span>
                    <span className="muted mono" style={{ fontSize: 'var(--text-2xs)' }}>
                      {[a.provider, a.model].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </AsyncSection>
      </Section>

      <Section
        title="Permissions"
        description="Керування правами агентів — майбутня функція thin gateway. Зміна permissions є дією рівня L3 і завжди потребує підтвердження Романа."
      >
        <ul className="card card--flush list" style={{ listStyle: 'none' }}>
          <PlannedRow
            label="Per-client scopes"
            detail="Окремі credentials для Hermes, Claude Code і майбутніх клієнтів замість спільного token."
          />
          <PlannedRow
            label="Approval gates"
            detail="Явне підтвердження для дій рівня L2/L3 просто з панелі."
          />
        </ul>
      </Section>

      <Section title="GBrain" description="Конфігурація спільної довготривалої памʼяті.">
        <AsyncSection query={connectionsQuery} loadingRows={1} emptyTitle="Немає даних">
          {(result) => {
            const gbrain = result.data.find((c) => c.id === 'gbrain')
            return (
              <div className="card stack stack--tight">
                {gbrain ? (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 'var(--text-sm)' }}>{gbrain.name}</strong>
                      <ConnectionStateBadge state={gbrain.state} />
                    </div>
                    <p className="muted mono" style={{ fontSize: 'var(--text-2xs)' }}>
                      {gbrain.detail}
                    </p>
                  </>
                ) : (
                  <p className="muted">GBrain не налаштований.</p>
                )}
                <p className="muted">
                  Панель ніколи не стає власною базою памʼяті й не є другим джерелом правди для
                  фактів у GBrain.
                </p>
              </div>
            )
          }}
        </AsyncSection>
      </Section>

      <Section title="Backups" description="Backup без перевіреного restore — лише надія.">
        <AsyncSection query={backupQuery} loadingRows={1} emptyTitle="Немає даних про backup">
          {(result) => {
            const b = result.data
            return (
              <>
                <div className="card stack stack--tight">
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    <HealthDot level={b.level} />
                    <strong style={{ fontSize: 'var(--text-sm)' }}>
                      {b.lastBackupAt ? formatDateTime(b.lastBackupAt) : 'Backup не робився'}
                    </strong>
                  </div>
                  {b.location && (
                    <p className="muted mono" style={{ fontSize: 'var(--text-2xs)' }}>
                      {b.location}
                    </p>
                  )}
                  <div className="row">
                    <span className={`badge ${b.restoreVerified ? 'badge--ok' : 'badge--error'}`}>
                      restore {b.restoreVerified ? 'перевірено' : 'не перевірено'}
                    </span>
                    <span className={`badge ${b.offDeviceCopy ? 'badge--ok' : 'badge--warn'}`}>
                      {b.offDeviceCopy ? 'є копія поза пристроєм' : 'немає копії поза пристроєм'}
                    </span>
                  </div>
                  <p className="muted">{b.detail}</p>
                </div>
                <DataNotice
                  origin={result.origin}
                  source={result.sourceOfTruth}
                  retrievedAt={result.retrievedAt}
                />
              </>
            )
          }}
        </AsyncSection>
      </Section>

      <Section title="Security" description="Правила, яких дотримується цей frontend.">
        <ul className="card card--flush list" style={{ listStyle: 'none' }}>
          <li className="list__row">
            <strong style={{ fontSize: 'var(--text-sm)' }}>Секрети не зберігаються у frontend</strong>
            <p className="muted" style={{ marginTop: 2 }}>
              Ні API-ключів, ні токенів, ні bearer credentials — ані у коді, ані в localStorage.
              Єдине, що панель зберігає локально, — обрана тема.
            </p>
          </li>
          <li className="list__row">
            <strong style={{ fontSize: 'var(--text-sm)' }}>Доступ лише через майбутній gateway</strong>
            <p className="muted" style={{ marginTop: 2 }}>
              GBrain не відкривається в інтернет напряму. Реальні дані підуть через thin backend,
              який тримає credentials і scopes.
            </p>
          </li>
          <li className="list__row">
            <strong style={{ fontSize: 'var(--text-sm)' }}>Незворотні дії — за Романом</strong>
            <p className="muted" style={{ marginTop: 2 }}>
              Панель у поточному вигляді лише читає. Дії рівня L3 не виконуються автоматично.
            </p>
          </li>
        </ul>
      </Section>

      <Section title="Appearance">
        <div className="card stack stack--tight">
          <span className="section-title" style={{ letterSpacing: '0.04em' }}>
            Тема
          </span>
          <div className="row" role="group" aria-label="Вибір теми">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`btn btn--sm ${theme === t.value ? 'btn--primary' : ''}`}
                aria-pressed={theme === t.value}
                onClick={() => setTheme(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Developer / Diagnostics">
        <div className="card stack stack--tight">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Джерело даних</span>
            <span className="badge badge--warn mono" data-testid="data-source-mode">
              {mode}
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Режим відображення</span>
            <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>
              {typeof window !== 'undefined' &&
              window.matchMedia('(display-mode: standalone)').matches
                ? 'standalone (PWA)'
                : 'browser'}
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Service worker</span>
            <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>
              {typeof navigator !== 'undefined' && 'serviceWorker' in navigator
                ? 'підтримується'
                : 'недоступний'}
            </span>
          </div>
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            Усі дані в панелі зараз походять з локального набору fixtures, зібраного з canonical
            документів Roman AI OS. Жодна реальна система не опитується.
          </p>
        </div>
      </Section>
    </div>
  )
}
