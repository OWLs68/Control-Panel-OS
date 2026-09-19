import type {
  AgentState,
  ConnectionState,
  DataOrigin,
  HealthLevel,
  MemoryState,
  ProjectStatus,
  RiskLevel,
  SourceOfTruth,
} from '@/domain/types'

/* ------------------------------------------------------------ data origin */

const ORIGIN_LABEL: Record<DataOrigin, string> = {
  mock: 'MOCK',
  live: 'LIVE',
}

/**
 * The most important badge in the panel: it must always be obvious whether a
 * number is real or a demo fixture. Canonical rule — the UI must never create
 * the impression that demo data is live data.
 */
export function OriginBadge({ origin, title }: { origin: DataOrigin; title?: string }) {
  return (
    <span
      className={`badge ${origin === 'mock' ? 'badge--warn' : 'badge--ok'}`}
      title={
        title ??
        (origin === 'mock'
          ? 'Демонстраційні дані. Реальна система не опитується.'
          : 'Дані з реального джерела.')
      }
      data-testid={`origin-${origin}`}
    >
      <span className={`dot dot--${origin === 'mock' ? 'warn' : 'ok'}`} />
      {ORIGIN_LABEL[origin]}
    </span>
  )
}

/* --------------------------------------------------------- source of truth */

const SOURCE_LABEL: Record<SourceOfTruth, string> = {
  gbrain: 'GBrain',
  'project-state': 'STATE.md',
  'project-doc': 'PROJECT.md',
  github: 'GitHub',
  'google-drive': 'Drive',
  gmail: 'Gmail',
  calendar: 'Calendar',
  hermes: 'Hermes',
  'local-runtime': 'Локальний runtime',
  'control-panel': 'Панель (похідне)',
}

/** Where the real answer lives. The panel only ever mirrors it. */
export function SourceBadge({ source }: { source: SourceOfTruth }) {
  return (
    <span className="badge badge--outline" title="Джерело правди для цих даних">
      {SOURCE_LABEL[source]}
    </span>
  )
}

/* ------------------------------------------------------------------ health */

const HEALTH_CLASS: Record<HealthLevel, string> = {
  ok: 'ok',
  warn: 'warn',
  error: 'error',
  unknown: '',
  off: '',
}

export function HealthDot({ level }: { level: HealthLevel }) {
  const cls = HEALTH_CLASS[level]
  return <span className={`dot${cls ? ` dot--${cls}` : ''}`} aria-hidden="true" />
}

/* --------------------------------------------------------- project status */

const PROJECT_STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  active: { label: 'Активний', cls: 'badge--ok' },
  paused: { label: 'Пауза', cls: 'badge--outline' },
  'watch-only': { label: 'Спостереження', cls: 'badge--outline' },
  closed: { label: 'Закритий', cls: 'badge' },
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status]
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

/* ------------------------------------------------------------ agent state */

const AGENT_STATE: Record<AgentState, { label: string; cls: string }> = {
  online: { label: 'Онлайн', cls: 'badge--ok' },
  idle: { label: 'Очікує', cls: 'badge--outline' },
  offline: { label: 'Офлайн', cls: 'badge' },
  error: { label: 'Помилка', cls: 'badge--error' },
  planned: { label: 'Заплановано', cls: 'badge--outline' },
}

export function AgentStateBadge({ state }: { state: AgentState }) {
  const s = AGENT_STATE[state]
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

/* ------------------------------------------------------- connection state */

const CONNECTION_STATE: Record<ConnectionState, { label: string; cls: string }> = {
  connected: { label: 'Підключено', cls: 'badge--ok' },
  degraded: { label: 'Часткова', cls: 'badge--warn' },
  disconnected: { label: 'Відключено', cls: 'badge--error' },
  'not-configured': { label: 'Не налаштовано', cls: 'badge--outline' },
}

export function ConnectionStateBadge({ state }: { state: ConnectionState }) {
  const s = CONNECTION_STATE[state]
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

/* ------------------------------------------------------------ memory state */

const MEMORY_STATE: Record<MemoryState, { label: string; cls: string }> = {
  active: { label: 'Активний', cls: 'badge--ok' },
  obsolete: { label: 'Застарілий', cls: 'badge--warn' },
  forgotten: { label: 'Відкликаний', cls: 'badge' },
  superseded: { label: 'Замінений', cls: 'badge--outline' },
}

export function MemoryStateBadge({ state }: { state: MemoryState }) {
  const s = MEMORY_STATE[state]
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

/* -------------------------------------------------------------- risk level */

const RISK_HINT: Record<RiskLevel, string> = {
  L0: 'L0 — лише читання',
  L1: 'L1 — внутрішній оборотний запис',
  L2: 'L2 — зовнішня оборотна дія',
  L3: 'L3 — критична / незворотна дія',
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  const cls = level === 'L3' ? 'badge--error' : level === 'L2' ? 'badge--warn' : 'badge--outline'
  return (
    <span className={`badge ${cls}`} title={RISK_HINT[level]}>
      {level}
    </span>
  )
}
