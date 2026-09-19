import { useAdapters } from '@/ui/hooks/adapters'
import { useSourced } from '@/ui/hooks/useSourced'
import { AsyncSection } from '@/ui/components/States'
import { DataNotice } from '@/ui/components/DataNotice'
import { AgentStateBadge, RiskBadge } from '@/ui/components/Badges'
import { formatRelative } from '@/ui/format'
import type { AgentStatus } from '@/domain/types'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 'var(--space-2)' }}>
      <span className="section-title" style={{ letterSpacing: '0.04em' }}>
        {label}
      </span>
      <div className="muted" style={{ marginTop: 2 }}>
        {children}
      </div>
    </div>
  )
}

function AgentCard({ agent }: { agent: AgentStatus }) {
  return (
    <li className="list__row">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <strong style={{ fontSize: 'var(--text-base)' }}>{agent.name}</strong>
          <AgentStateBadge state={agent.state} />
        </div>
        <RiskBadge level={agent.maxAutonomousRisk} />
      </div>
      <p className="muted" style={{ marginTop: 2 }}>
        {agent.role}
      </p>

      {(agent.provider || agent.model) && (
        <Field label="Provider / model">
          <span className="mono">
            {[agent.provider, agent.model].filter(Boolean).join(' · ')}
          </span>
        </Field>
      )}

      <Field label="Доступ до памʼяті">{agent.memoryAccess}</Field>

      {agent.permissions.length > 0 && (
        <Field label="Permissions">
          <div className="row" style={{ gap: 'var(--space-1)' }}>
            {agent.permissions.map((p) => (
              <span key={p} className="badge badge--outline mono">
                {p}
              </span>
            ))}
          </div>
        </Field>
      )}

      {agent.connectedTools.length > 0 && (
        <Field label="Інструменти">{agent.connectedTools.join(' · ')}</Field>
      )}

      {agent.lastActivity && (
        <Field label="Остання активність">{formatRelative(agent.lastActivity)}</Field>
      )}

      {agent.issues.length > 0 && (
        <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
          {agent.issues.map((issue) => (
            <div
              key={issue}
              className="badge badge--warn"
              style={{ whiteSpace: 'normal', textAlign: 'start', lineHeight: 1.4 }}
            >
              {issue}
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

export function Agents() {
  const { agents } = useAdapters()
  const query = useSourced(() => agents.listAgents(), [agents])

  return (
    <div className="stack stack--loose">
      <div>
        <h1 className="page-heading">Агенти / AI-клієнти</h1>
        <p className="page-intro">
          Хто працює з системою, з якими правами й доступом до памʼяті. Оркестрація свідомо
          не побудована.
        </p>
      </div>

      <AsyncSection
        query={query}
        loadingRows={4}
        isEmpty={(data) => data.length === 0}
        emptyTitle="Агентів не зареєстровано"
      >
        {(result) => (
          <>
            <ul className="card card--flush list" style={{ listStyle: 'none' }}>
              {result.data.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
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

      <section className="card stack stack--tight">
        <span className="section-title">Рівні ризику дій</span>
        <p className="muted">
          <strong className="mono">L0</strong> — лише читання ·{' '}
          <strong className="mono">L1</strong> — внутрішній оборотний запис ·{' '}
          <strong className="mono">L2</strong> — зовнішня оборотна дія ·{' '}
          <strong className="mono">L3</strong> — критична / незворотна дія, лише з явним
          підтвердженням Романа.
        </p>
      </section>
    </div>
  )
}
