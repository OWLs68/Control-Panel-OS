/**
 * The app-wide change signal.
 *
 * One event, one payload shape. NeverMind learned this the hard way with an
 * ad-hoc `nm-data-changed` detail that every listener parsed differently; here
 * the envelope is typed, so a new listener cannot guess wrong.
 */
export interface DataChange {
  /** Which store changed, e.g. 'projects'. */
  store: string
  /** What happened to it. */
  kind: 'create' | 'update' | 'delete' | 'replace'
  /** The affected entity id, when a single record changed. */
  id?: string
}

export const DATA_CHANGED = 'roma-data-changed'
export const MODULE_CHANGED = 'roma-module-changed'
export const UI_CONTEXT_CHANGED = 'roma-ui-context-changed'

export function emitDataChanged(detail: DataChange): void {
  window.dispatchEvent(new CustomEvent<DataChange>(DATA_CHANGED, { detail }))
}

export function onDataChanged(fn: (detail: DataChange) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<DataChange>).detail)
  window.addEventListener(DATA_CHANGED, handler)
  return () => window.removeEventListener(DATA_CHANGED, handler)
}

export function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function on(name: string, fn: (detail: unknown) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent).detail)
  window.addEventListener(name, handler)
  return () => window.removeEventListener(name, handler)
}
