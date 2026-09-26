/**
 * The Event Center — Crow OS MP's record of what the system and its agents did.
 *
 *   producer on the Mac (curl today, an agent later)
 *     → POST /api/v1/events (loopback, producer token)  → this file's store
 *     → GET  /api/v1/state  (the phone, through Serve)   → the «Події» screen
 *
 * Operational events are not memory: they live next to the gateway, in one
 * JSON file outside the repository, owner-only, written atomically (temp file
 * + rename), newest 500 kept. GBrain is for durable facts; push delivery,
 * a notification policy and read/unread state come later, on top of this.
 *
 * A producer may name its event with an `id` of its own — a deal's row in its
 * database, a run id — and sending the same `id` again changes nothing, so a
 * retry after a timeout is always safe. Without one, the gateway makes one.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { IncomingHttpHeaders } from 'node:http'
import type { AgentEventKind, Severity, SystemEvent } from '../../../src/data/types.ts'
import { expandHome } from './session-state.ts'

export const EVENT_KINDS: readonly AgentEventKind[] = ['agent_started', 'agent_result', 'agent_finished', 'agent_blocked', 'alert']
const SEVERITIES: readonly Severity[] = ['info', 'warning', 'critical']

export const EVENT_LIMITS = {
  bodyBytes: 16 * 1024,
  id: 128,
  title: 140,
  detail: 1_000,
  source: 60,
  ref: 128,
  /** Kept on disk; the oldest go first. */
  keep: 500,
  /** Carried by one GET /api/v1/state. */
  inSnapshot: 50,
  /** A producer's clock may run a little ahead of the Mac's; further than this is a bug worth refusing. */
  futureSkewMs: 5 * 60_000,
} as const

const ID_PATTERN = /^[A-Za-z0-9._:-]+$/

export interface EventInput {
  id: string | null
  kind: AgentEventKind
  title: string
  detail: string
  source: string
  agentId: string | null
  taskId: string | null
  projectId: string | null
  severity: Severity
  needsRoman: boolean
  /** Event time (ms); null — the time it arrives. */
  ts: number | null
}

export type EventParse =
  | { ok: true; input: EventInput }
  | { ok: false; error: 'bad_request' }
  | { ok: false; error: 'invalid_event'; field: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** One line, trimmed, cut to size: a title or a name never carries a layout. */
function oneLine(v: string, max: number): string {
  const flat = v.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) : flat
}

/**
 * The body a producer sent, checked field by field. Wrong types and unknown
 * kinds are refused with the field's name, so a producer's bug is loud; long
 * text is cut to size, as with Crow's requests.
 */
export function parseEventInput(text: string, now: number = Date.now()): EventParse {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, error: 'bad_request' } }
  if (!isRecord(raw)) return { ok: false, error: 'bad_request' }
  const invalid = (field: string): EventParse => ({ ok: false, error: 'invalid_event', field })

  let id: string | null = null
  if (raw.id !== undefined && raw.id !== null) {
    if (typeof raw.id !== 'string' || !raw.id || raw.id.length > EVENT_LIMITS.id || !ID_PATTERN.test(raw.id)) return invalid('id')
    id = raw.id
  }

  if (typeof raw.kind !== 'string' || !(EVENT_KINDS as readonly string[]).includes(raw.kind)) return invalid('kind')
  const kind = raw.kind as AgentEventKind

  const title = typeof raw.title === 'string' ? oneLine(raw.title, EVENT_LIMITS.title) : ''
  if (!title) return invalid('title')

  const source = typeof raw.source === 'string' ? oneLine(raw.source, EVENT_LIMITS.source) : ''
  if (!source) return invalid('source')

  let detail = ''
  if (raw.detail !== undefined && raw.detail !== null) {
    if (typeof raw.detail !== 'string') return invalid('detail')
    const trimmed = raw.detail.trim()
    detail = trimmed.length > EVENT_LIMITS.detail ? trimmed.slice(0, EVENT_LIMITS.detail) : trimmed
  }

  const ref = (field: 'agentId' | 'taskId' | 'projectId'): string | null | undefined => {
    const v = raw[field]
    if (v === undefined || v === null) return null
    if (typeof v !== 'string') return undefined
    const cut = oneLine(v, EVENT_LIMITS.ref)
    return cut || null
  }
  const agentId = ref('agentId')
  if (agentId === undefined) return invalid('agentId')
  const taskId = ref('taskId')
  if (taskId === undefined) return invalid('taskId')
  const projectId = ref('projectId')
  if (projectId === undefined) return invalid('projectId')

  let severity: Severity = 'info'
  if (raw.severity !== undefined && raw.severity !== null) {
    if (typeof raw.severity !== 'string' || !(SEVERITIES as readonly string[]).includes(raw.severity)) return invalid('severity')
    severity = raw.severity as Severity
  }

  let needsRoman = false
  if (raw.needsRoman !== undefined && raw.needsRoman !== null) {
    if (typeof raw.needsRoman !== 'boolean') return invalid('needsRoman')
    needsRoman = raw.needsRoman
  }

  let ts: number | null = null
  if (raw.ts !== undefined && raw.ts !== null) {
    const parsed = typeof raw.ts === 'number' ? raw.ts : typeof raw.ts === 'string' ? Date.parse(raw.ts) : Number.NaN
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > now + EVENT_LIMITS.futureSkewMs) return invalid('ts')
    ts = parsed
  }

  return { ok: true, input: { id, kind, title, detail, source, agentId, taskId, projectId, severity, needsRoman, ts } }
}

/** The envelope every record in Crow OS MP carries, stamped by the Event Center on arrival. */
export function toSystemEvent(input: EventInput, receivedAt: number, newId: () => string = randomUUID): SystemEvent {
  const at = new Date(receivedAt).toISOString()
  return {
    id: input.id ?? newId(),
    user_id: null,
    created_at: at,
    updated_at: at,
    deleted_at: null,
    hlc: null,
    ts: input.ts ?? receivedAt,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    source: input.source,
    agentId: input.agentId,
    taskId: input.taskId,
    projectId: input.projectId,
    severity: input.severity,
    needsRoman: input.needsRoman,
  }
}

/** A row read back from disk: only what the phone would accept goes out. */
function isStoredEvent(row: unknown): row is SystemEvent {
  if (!isRecord(row)) return false
  return typeof row.id === 'string' && row.id.length > 0
    && typeof row.ts === 'number' && Number.isFinite(row.ts)
    && typeof row.kind === 'string' && (EVENT_KINDS as readonly string[]).includes(row.kind)
    && typeof row.title === 'string' && row.title.length > 0
    && typeof row.detail === 'string' && typeof row.source === 'string'
    && typeof row.created_at === 'string' && typeof row.updated_at === 'string'
}

/** Newest first by event time; the same time — newest received first. */
function newestFirst(a: SystemEvent, b: SystemEvent): number {
  return b.ts - a.ts || b.created_at.localeCompare(a.created_at)
}

export interface EventStore {
  /** Newest first. Never throws: a store that cannot be read is an empty feed and a log line. */
  list(limit: number): Promise<SystemEvent[]>
  /** A known id is not written again: the stored event comes back, marked as a duplicate. */
  append(event: SystemEvent): Promise<{ event: SystemEvent; duplicate: boolean }>
}

interface StoreFile { version: 1; events: SystemEvent[] }

/**
 * The store on disk. The gateway is the only writer, so the events are held in
 * memory after the first read, and writes go one after another — two
 * producers posting at the same moment cannot overwrite each other.
 */
export function fileEventStore(rawPath: string, keep: number = EVENT_LIMITS.keep, log: (line: string) => void = console.warn): EventStore {
  const path = expandHome(rawPath)
  let events: SystemEvent[] | null = null
  let queue: Promise<unknown> = Promise.resolve()

  async function load(): Promise<SystemEvent[]> {
    if (events) return events
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      events = []   // no file yet: nothing has happened
      return events
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      const rows = isRecord(parsed) && Array.isArray(parsed.events) ? parsed.events : null
      if (!rows) throw new Error('not an event file')
      events = rows.filter(isStoredEvent)
      if (events.length !== rows.length) log(`[gateway] events: ${rows.length - events.length} unreadable row(s) skipped in ${path}`)
    } catch {
      // Kept aside, not overwritten: whatever it was, the next write must not destroy it.
      const aside = `${path}.corrupt-${Date.now()}`
      try { await rename(path, aside) } catch { /* already gone */ }
      log(`[gateway] events: ${path} could not be read — moved to ${aside}, starting empty`)
      events = []
    }
    return events
  }

  async function save(next: SystemEvent[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const tmp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`
    const body: StoreFile = { version: 1, events: next }
    await writeFile(tmp, `${JSON.stringify(body)}\n`, { encoding: 'utf8', mode: 0o600 })
    await chmod(tmp, 0o600)   // writeFile's mode is masked by the umask; this is not
    await rename(tmp, path)
  }

  return {
    async list(limit) {
      await queue.catch(() => undefined)
      try {
        return [...await load()].sort(newestFirst).slice(0, Math.max(0, limit))
      } catch (err) {
        log(`[gateway] events: read failed — ${err instanceof Error ? err.message : String(err)}`)
        return []
      }
    },
    append(event) {
      const run = queue.then(async () => {
        const current = await load()
        const known = current.find((e) => e.id === event.id)
        if (known) return { event: known, duplicate: true }
        // Kept in the order they arrived; the oldest arrivals leave first.
        const next = [...current, event].slice(-keep)
        await save(next)
        events = next
        return { event, duplicate: false }
      })
      queue = run.catch(() => undefined)
      return run
    },
  }
}

/** For the tests: the same contract, nothing on disk. */
export function memoryEventStore(keep: number = EVENT_LIMITS.keep): EventStore & { events: SystemEvent[] } {
  const store = {
    events: [] as SystemEvent[],
    async list(limit: number) { return [...store.events].sort(newestFirst).slice(0, Math.max(0, limit)) },
    async append(event: SystemEvent) {
      const known = store.events.find((e) => e.id === event.id)
      if (known) return { event: known, duplicate: true }
      store.events = [...store.events, event].slice(-keep)
      return { event, duplicate: false }
    },
  }
  return store
}

/** `Authorization: Bearer <token>`, or null. */
export function bearerFrom(headers: IncomingHttpHeaders): string | null {
  const raw = headers.authorization
  const value = Array.isArray(raw) ? raw[0] : raw
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value ?? '')
  return match?.[1] ?? null
}

/** Compared as digests, in constant time: neither the value nor its length leaks through timing. */
export function tokenMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
