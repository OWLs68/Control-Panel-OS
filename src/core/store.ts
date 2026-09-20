/**
 * Domain stores.
 *
 * One contract for every domain — `all`, `get`, `put`, `remove` — over
 * localStorage. Records are stamped on the way in, removal is soft, and every
 * write announces itself so open screens redraw.
 *
 * Why a shared factory here when NeverMind forbids a central `db.js`: what it
 * forbids is one module that owns *all* the keys and that every tab has to go
 * through. This is the opposite — each domain calls `createStore` and gets its
 * own isolated key and its own typed handle. There is no god object, and no
 * domain can reach into another's data.
 */
import { emitDataChanged } from './events.js'
import { type Entity, isLive, softDelete, stampEntity } from './entity.js'

export interface Store<T extends Entity> {
  readonly key: string
  /** Live records only — tombstones stay on disk but never surface. */
  all(): T[]
  /** Including soft-deleted, for a future sync layer. */
  raw(): T[]
  get(id: string): T | undefined
  put(rec: Partial<T> & Omit<T, keyof Entity>): T
  update(id: string, patch: Partial<T>): T | undefined
  remove(id: string): boolean
  replaceAll(recs: (Partial<T> & Omit<T, keyof Entity>)[]): T[]
}

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function write<T>(key: string, rows: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(rows))
  } catch (err) {
    // A full quota must not take the screen down with it: the render path keeps
    // working off what is already in memory.
    console.warn(`[store] write failed for ${key}`, err)
  }
}

export function createStore<T extends Entity>(name: string): Store<T> {
  const key = `roma_${name}`

  const save = (rows: T[], kind: 'create' | 'update' | 'delete' | 'replace', id?: string) => {
    write(key, rows)
    emitDataChanged(id === undefined ? { store: name, kind } : { store: name, kind, id })
  }

  return {
    key,
    raw: () => read<T>(key),
    all: () => read<T>(key).filter(isLive),
    get: (id) => read<T>(key).find((r) => r.id === id && isLive(r)),

    put(rec) {
      const rows = read<T>(key)
      const stamped = stampEntity(rec as T) as T
      const at = rows.findIndex((r) => r.id === stamped.id)
      if (at >= 0) rows[at] = stamped
      else rows.push(stamped)
      save(rows, at >= 0 ? 'update' : 'create', stamped.id)
      return stamped
    },

    update(id, patch) {
      const rows = read<T>(key)
      const at = rows.findIndex((r) => r.id === id)
      const current = rows[at]
      if (at < 0 || !current) return undefined
      const next = stampEntity({ ...current, ...patch }) as T
      rows[at] = next
      save(rows, 'update', id)
      return next
    },

    remove(id) {
      const rows = read<T>(key)
      const at = rows.findIndex((r) => r.id === id)
      const current = rows[at]
      if (at < 0 || !current) return false
      rows[at] = softDelete(current)
      save(rows, 'delete', id)
      return true
    },

    replaceAll(recs) {
      const rows = recs.map((r) => stampEntity(r as T) as T)
      save(rows, 'replace')
      return rows
    },
  }
}
