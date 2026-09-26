/**
 * GBrain fact → Crow OS MP MemoryFact.
 *
 * The field names on the left are what the installed GBrain (0.51) actually
 * returns from `recall` — checked against a live response on 21.09, not the
 * protocol doc. The shape on the right is `src/data/types.ts`.
 *
 * Deterministic envelope rule, so nothing synthetic is passed off as GBrain's:
 *   id          = fact_id (GBrain's stable id, as a string); never generated
 *   created_at  = created_at
 *   updated_at  = created_at (a fact is immutable; a changed fact is a new one)
 *   deleted_at  = null (expired facts are not requested)
 *   user_id     = null, hlc = null (no auth, no sync layer — same as the stores)
 *   ts          = valid_from, falling back to created_at (event time, then write time)
 *
 * Category rule (Roman, 21.09): kind=preference → preference; entity_slug
 * people/* → person; projects/* → project; everything else → system. Note
 * that the installed brain uses bare slugs ("roman-ai-os"), so today those
 * land in "system"; the rule is applied as written, not guessed around.
 */
import type { MemoryFact } from '../../../src/data/types.ts'

export interface RawFact {
  fact_id: string
  fact: string
  kind: string
  entity_slug: string | null
  valid_from: string | null
  created_at: string
}

type Category = MemoryFact['category']

export function factCategory(kind: string, entitySlug: string | null): Category {
  if (kind === 'preference') return 'preference'
  const slug = entitySlug ?? ''
  if (slug.startsWith('people/')) return 'person'
  if (slug.startsWith('projects/')) return 'project'
  return 'system'
}

/** Accepts one row of `recall().facts`; returns null when it lacks what we need. */
export function parseRawFact(row: unknown): RawFact | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const factId = typeof r.fact_id === 'string' && r.fact_id.length > 0
    ? r.fact_id
    : typeof r.id === 'number' || typeof r.id === 'string' ? String(r.id) : null
  const fact = typeof r.fact === 'string' ? r.fact.trim() : ''
  const createdAt = typeof r.created_at === 'string' && !Number.isNaN(Date.parse(r.created_at)) ? r.created_at : null
  if (!factId || !fact || !createdAt) return null
  return {
    fact_id: factId,
    fact,
    kind: typeof r.kind === 'string' ? r.kind : 'fact',
    entity_slug: typeof r.entity_slug === 'string' ? r.entity_slug : null,
    valid_from: typeof r.valid_from === 'string' && !Number.isNaN(Date.parse(r.valid_from)) ? r.valid_from : null,
    created_at: createdAt,
  }
}

export function toMemoryFact(raw: RawFact): MemoryFact {
  return {
    id: raw.fact_id,
    user_id: null,
    created_at: raw.created_at,
    updated_at: raw.created_at,
    deleted_at: null,
    hlc: null,
    text: raw.fact,
    category: factCategory(raw.kind, raw.entity_slug),
    ts: Date.parse(raw.valid_from ?? raw.created_at),
  }
}

/** Rows that fail validation are dropped, and the count is reported. */
export function mapFacts(rows: unknown): { facts: MemoryFact[]; dropped: number } {
  if (!Array.isArray(rows)) return { facts: [], dropped: 0 }
  const facts: MemoryFact[] = []
  let dropped = 0
  for (const row of rows) {
    const raw = parseRawFact(row)
    if (raw) facts.push(toMemoryFact(raw))
    else dropped++
  }
  return { facts, dropped }
}
