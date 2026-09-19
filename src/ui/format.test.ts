import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatRelative } from './format'

describe('format helpers', () => {
  it('returns the raw string for an unparseable date instead of "Invalid Date"', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
    expect(formatDate('not-a-date')).toBe('not-a-date')
    expect(formatRelative('not-a-date')).toBe('not-a-date')
  })

  it('formats relative times in the past', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    expect(formatRelative('2026-09-19T11:59:40Z', now)).toBe('щойно')
    expect(formatRelative('2026-09-19T09:00:00Z', now)).toMatch(/3/)
    expect(formatRelative('2026-09-16T12:00:00Z', now)).toMatch(/3/)
  })

  it('formats an ISO timestamp without throwing', () => {
    expect(formatDateTime('2026-09-18T12:00:00Z')).toMatch(/\d/)
    expect(formatDate('2026-09-18T12:00:00Z')).toMatch(/2026/)
  })
})
