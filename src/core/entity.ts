/**
 * The entity envelope — ported from NeverMind's `stampEntity`.
 *
 * This is the one-way door: every record in every store carries the same
 * id/created_at/updated_at/deleted_at/hlc shape from day one, because
 * retrofitting it once real data exists is how sync breaks on live users.
 *
 * It is NOT a store. `stampEntity` is a pure factory — it reads nothing and
 * writes nothing. Each store stamps its own records on the way in.
 *
 * Deliberately left open, same as in the donor:
 *   - `hlc` stays null until there is a sync layer to stamp a real
 *     hybrid logical clock into it. The field exists now so the shape never
 *     has to change later.
 *   - `user_id` stays null until there is auth.
 */
import { generateUUID } from './uuid.js'

export interface Entity {
  id: string
  user_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  hlc: string | null
}

/** ISO 8601 in UTC — the single time format for the envelope. */
export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Field order matters: the record spreads first, envelope fields after, so a
 * stale `updated_at` carried on the input can never overwrite the fresh one.
 */
export function stampEntity<T extends object>(rec: T & Partial<Entity> = {} as T): T & Entity {
  const ts = nowISO()
  return {
    ...(rec as T),
    id: rec.id ?? generateUUID(),
    user_id: rec.user_id ?? null,
    created_at: rec.created_at ?? ts,
    updated_at: ts,
    deleted_at: rec.deleted_at ?? null,
    hlc: rec.hlc ?? null,
  }
}

/** Soft delete: a tombstone, so a later sync can propagate the removal. */
export function softDelete<T extends Entity>(rec: T): T {
  return { ...rec, deleted_at: nowISO(), updated_at: nowISO() }
}

export function isLive<T extends Entity>(rec: T): boolean {
  return rec.deleted_at === null
}
