import type { DataOrigin } from '@/domain/types'
import { OriginBadge, SourceBadge } from './Badges'
import type { SourceOfTruth } from '@/domain/types'
import { formatDateTime } from '@/ui/format'

/**
 * Per-section provenance line: origin (mock/live), where the truth actually
 * lives, and when the snapshot was taken.
 */
export function DataNotice({
  origin,
  source,
  retrievedAt,
  note,
}: {
  origin: DataOrigin
  source: SourceOfTruth
  retrievedAt: string
  note?: string
}) {
  return (
    <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
      <OriginBadge origin={origin} />
      <SourceBadge source={source} />
      <span className="muted mono" style={{ fontSize: 'var(--text-2xs)' }}>
        {formatDateTime(retrievedAt)}
      </span>
      {note && (
        <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
          {note}
        </span>
      )}
    </div>
  )
}
