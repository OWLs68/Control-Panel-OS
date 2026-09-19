/** Shared date/label formatting. Ukrainian locale, panel-wide. */

const LOCALE = 'uk-UA'

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "3 дні тому" — relative labels for freshness at a glance. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const diffMs = now.getTime() - d.getTime()
  const minutes = Math.round(diffMs / 60_000)

  if (Math.abs(minutes) < 1) return 'щойно'

  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
  ]

  let value = -minutes
  for (const [unit, step] of units) {
    if (Math.abs(value) < step) return rtf.format(Math.round(value), unit)
    value /= step
  }
  return rtf.format(Math.round(value), 'year')
}
