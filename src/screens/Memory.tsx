import { useState } from 'react'
import { useAdapters } from '@/ui/hooks/adapters'
import { useSourced } from '@/ui/hooks/useSourced'
import { AsyncSection } from '@/ui/components/States'
import { DataNotice } from '@/ui/components/DataNotice'
import { MemoryStateBadge } from '@/ui/components/Badges'
import { formatRelative } from '@/ui/format'
import type { MemoryItem, MemoryLayer } from '@/domain/types'

const LAYER_LABEL: Record<MemoryLayer, string> = {
  semantic: 'Semantic',
  episodic: 'Episodic',
  'task-state': 'Task state',
}

const VERB_HINT: Record<string, string> = {
  recall: 'знайти релевантну памʼять',
  remember: 'записати довготривалий факт',
  entity: 'працювати з конкретною сутністю',
  synthesize: 'зібрати висновок із кількох шматків',
  forget: 'відкликати памʼять',
  context_pack: 'зібрати компактний пакет контексту',
  delta: 'отримати зміни від моменту T',
}

const ALL_VERBS = [
  'recall',
  'remember',
  'entity',
  'synthesize',
  'forget',
  'context_pack',
  'delta',
] as const

function MemoryRow({ item }: { item: MemoryItem }) {
  return (
    <li className="list__row">
      <p style={{ fontSize: 'var(--text-sm)' }}>{item.content}</p>
      <div className="row" style={{ marginTop: 'var(--space-2)', gap: 'var(--space-2)' }}>
        <span className="badge badge--outline mono">#{item.id}</span>
        <MemoryStateBadge state={item.state} />
        <span className="badge">{LAYER_LABEL[item.layer]}</span>
        {item.entity && <span className="badge badge--accent mono">{item.entity}</span>}
      </div>
      <p className="muted mono" style={{ fontSize: 'var(--text-2xs)', marginTop: 'var(--space-2)' }}>
        provenance: {item.provenance} · створено {formatRelative(item.createdAt)}
        {item.updatedAt ? ` · оновлено ${formatRelative(item.updatedAt)}` : ''}
      </p>
    </li>
  )
}

export function Memory() {
  const { gbrain } = useAdapters()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  const supported = gbrain.supportedVerbs()
  const recentQuery = useSourced(() => gbrain.recent(12), [gbrain])
  const searchQuery = useSourced(() => gbrain.search(query), [gbrain, query])

  const activeQuery = query ? searchQuery : recentQuery

  return (
    <div className="stack stack--loose">
      <div>
        <h1 className="page-heading">Памʼять</h1>
        <p className="page-intro">
          Вікно у GBrain. Панель не зберігає власної памʼяті й не замінює її.
        </p>
      </div>

      <form
        className="stack stack--tight"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(input.trim())
        }}
        role="search"
      >
        <label htmlFor="memory-search" className="section-title">
          Пошук (recall)
        </label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            id="memory-search"
            className="input"
            type="search"
            placeholder="напр. backup, архітектура, people/me"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn btn--primary">
            Знайти
          </button>
        </div>
        {query && (
          <button
            type="button"
            className="btn btn--sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              setQuery('')
              setInput('')
            }}
          >
            Очистити пошук
          </button>
        )}
      </form>

      <section className="stack stack--tight">
        <h2 className="section-title">
          {query ? `Результати для «${query}»` : 'Остання памʼять'}
        </h2>
        <AsyncSection
          query={activeQuery}
          loadingRows={4}
          isEmpty={(data) => data.length === 0}
          emptyTitle="Нічого не знайдено"
          emptyHint="Спробуйте інший запит або очистіть пошук."
        >
          {(result) => (
            <>
              <ul className="card card--flush list" style={{ listStyle: 'none' }}>
                {result.data.map((item) => (
                  <MemoryRow key={item.id} item={item} />
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
        <h2 className="section-title">Memory verbs</h2>
        <p className="muted">
          Сім базових операцій GBrain. Панель показує, які з них уже доступні через поточний
          adapter.
        </p>
        <ul className="card card--flush list" style={{ listStyle: 'none' }}>
          {ALL_VERBS.map((verb) => {
            const available = supported.includes(verb)
            return (
              <li key={verb} className="list__row row" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <strong className="mono" style={{ fontSize: 'var(--text-sm)' }}>
                    {verb}
                  </strong>
                  <p className="muted" style={{ marginTop: 2 }}>
                    {VERB_HINT[verb]}
                  </p>
                </div>
                <span className={`badge ${available ? 'badge--ok' : 'badge--outline'}`}>
                  {available ? 'доступний' : 'не підключений'}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
