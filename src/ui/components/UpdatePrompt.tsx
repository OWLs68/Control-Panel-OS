import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Service-worker update UX.
 *
 * NeverMind's bug B-73 is the lesson here: an installed iOS PWA that silently
 * keeps an old bundle looks broken and is hard to diagnose. So the panel tells
 * the user a new version exists and reloads only on their tap, and separately
 * confirms when it is ready to work offline.
 */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  const dismiss = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div
      className="card"
      role="status"
      style={{
        marginBottom: 'var(--space-4)',
        borderColor: 'var(--accent)',
        background: 'var(--accent-soft)',
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-sm)' }}>
          {needRefresh ? 'Доступна нова версія панелі.' : 'Панель готова працювати офлайн.'}
        </span>
        <div className="row">
          {needRefresh && (
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => void updateServiceWorker(true)}
            >
              Оновити
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={dismiss}>
            Закрити
          </button>
        </div>
      </div>
    </div>
  )
}
