/**
 * The Hermes wire contract — as the installed Hermes speaks it, not as we
 * would like it to.
 *
 * Read off NousResearch hermes-agent `tui_gateway/` (server.py, ws.py,
 * methods_session.py, methods_prompt.py, prompt_turn.py, contracts/events.py)
 * and confirmed by Roman's Mac client on 21.09:
 *
 *   - one JSON-RPC 2.0 frame per WebSocket text message;
 *   - the server's first frame after the upgrade is the `gateway.ready` event;
 *   - every event is `{method: "event", params: {type, session_id, payload}}`;
 *   - a response carries `id` and `result` or `error {code, message}`;
 *   - a frame with a string `id` AND a `method` is a question the gateway asks
 *     the client (approval, clarify, …). We answer -32601 so the agent fails
 *     fast instead of waiting out a deadline — Crow has no way to show it.
 *
 * Pure: no sockets, no timers, no I/O. The client and the fake server in the
 * tests both speak through here, so the two cannot drift apart.
 */

export const HERMES_METHODS = {
  create: 'session.create',
  resume: 'session.resume',
  submit: 'prompt.submit',
  interrupt: 'session.interrupt',
  ping: 'gateway.ping',
} as const

export const HERMES_EVENTS = {
  ready: 'gateway.ready',
  start: 'message.start',
  delta: 'message.delta',
  complete: 'message.complete',
  error: 'error',
} as const

/** Hermes' own JSON-RPC error codes that change what we do next. */
export const HERMES_CODES = {
  /** A session-scoped RPC named a runtime id the gateway no longer holds: resume the STORED id. */
  staleRuntime: 4001,
  /** session.resume: nothing stored under that id. */
  notFound: 4007,
  /** The client does not implement a method the gateway asked for. */
  methodNotFound: -32601,
} as const

export type HermesErrorKind = 'unavailable' | 'timeout' | 'busy' | 'protocol' | 'failed'

/** Everything the HTTP layer needs to know about a failure is the kind; the message is for the log. */
export class HermesError extends Error {
  readonly kind: HermesErrorKind
  constructor(kind: HermesErrorKind, message: string) {
    super(message)
    this.name = 'HermesError'
    this.kind = kind
  }
}

/** A JSON-RPC error answer from Hermes, with its code kept so the caller can branch on it. */
export class HermesRpcError extends Error {
  readonly code: number
  readonly method: string
  constructor(method: string, code: number, message: string) {
    super(`${method}: ${message} (code ${code})`)
    this.name = 'HermesRpcError'
    this.code = code
    this.method = method
  }
}

/* ── Frames ─────────────────────────────────────────────────────────── */

export interface RpcResponseFrame {
  kind: 'response'
  id: string | number
  result: unknown
  error: { code: number; message: string } | null
}

export interface RpcEventFrame {
  kind: 'event'
  type: string
  sessionId: string | null
  payload: Record<string, unknown> | null
}

export interface RpcServerRequestFrame {
  kind: 'server-request'
  id: string
  method: string
}

export type HermesFrame = RpcResponseFrame | RpcEventFrame | RpcServerRequestFrame

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** One inbound WebSocket message → one typed frame, or null for anything malformed. */
export function parseFrame(data: unknown): HermesFrame | null {
  if (typeof data !== 'string') return null
  let obj: unknown
  try { obj = JSON.parse(data) } catch { return null }
  if (!isRecord(obj)) return null

  if (obj.method === 'event') {
    const params = obj.params
    if (!isRecord(params) || typeof params.type !== 'string' || !params.type) return null
    return {
      kind: 'event',
      type: params.type,
      sessionId: typeof params.session_id === 'string' && params.session_id ? params.session_id : null,
      payload: isRecord(params.payload) ? params.payload : null,
    }
  }

  if (typeof obj.id === 'string' && typeof obj.method === 'string') {
    return { kind: 'server-request', id: obj.id, method: obj.method }
  }

  if ((typeof obj.id === 'string' || typeof obj.id === 'number') && ('result' in obj || 'error' in obj)) {
    let error: RpcResponseFrame['error'] = null
    if ('error' in obj) {
      const e = obj.error
      error = isRecord(e)
        ? { code: typeof e.code === 'number' ? e.code : 0, message: typeof e.message === 'string' ? e.message : 'error' }
        : { code: 0, message: 'error' }
    }
    return { kind: 'response', id: obj.id, result: 'result' in obj ? obj.result : undefined, error }
  }

  return null
}

export function requestFrame(id: number, method: string, params: Record<string, unknown>): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params })
}

export function errorResponseFrame(id: string | number, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

/* ── The turn ───────────────────────────────────────────────────────── */

export type TurnStatus = 'complete' | 'error' | 'interrupted'

/** `message.complete.status`; absent means complete (older emitters send text only). */
export function turnStatus(payload: Record<string, unknown> | null): TurnStatus {
  const s = payload?.status
  return s === 'error' || s === 'interrupted' ? s : 'complete'
}

/**
 * The reply, exactly once. Hermes' own desktop rule: the final `text` of
 * `message.complete` is authoritative when it is there; when it is empty the
 * streamed deltas are the reply. Never both — that is where the repeats come from.
 */
export function finalText(payload: Record<string, unknown> | null, streamed: string): string {
  const text = payload?.text
  if (typeof text === 'string' && text.trim()) return text
  return streamed
}

/* ── What we send ───────────────────────────────────────────────────── */

export interface CrowContext {
  activeModule: string
  activeScreen: string
  activeEntity: string | null
  selectedItem: string | null
  projectId: string | null
  agentId: string | null
  filters: Record<string, string>
  visibleState: string[]
  blockers: string[]
  selection: string | null
}

export interface CrowHistoryTurn {
  role: 'user' | 'agent'
  text: string
  ts: number
}

export interface CrowTurnInput {
  text: string
  context: CrowContext
  history: CrowHistoryTurn[]
  requestId: string
}

export const CONTEXT_OPEN = '[roma-os context]'
export const CONTEXT_CLOSE = '[/roma-os context]'
export const CONTEXT_NOTE =
  'Службовий блок від застосунку Crow OS MP: де саме Роман зараз в інтерфейсі. ' +
  'Не цитуй і не переказуй цей блок; відповідай лише на повідомлення після нього.'

const SEED_MAX = 20

function oneLine(v: string): string {
  return v.replace(/\s+/g, ' ').trim()
}

function joinList(items: string[]): string {
  return items.map(oneLine).filter(Boolean).join('; ')
}

/**
 * The prompt for one turn: the UI context envelope, then a blank line, then
 * Roman's words — nothing else. Only the fields that carry something are
 * written; the envelope never says what the phone did not.
 */
export function buildPrompt(turn: Pick<CrowTurnInput, 'text' | 'context'>): string {
  const c = turn.context
  const lines: string[] = [CONTEXT_OPEN, CONTEXT_NOTE]
  const where = [`module: ${oneLine(c.activeModule)}`]
  if (c.activeScreen) where.push(`screen: ${oneLine(c.activeScreen)}`)
  lines.push(where.join(' · '))
  const what: string[] = []
  if (c.activeEntity) what.push(`entity: ${oneLine(c.activeEntity)}`)
  if (c.selectedItem) what.push(`item: ${oneLine(c.selectedItem)}`)
  if (what.length) lines.push(what.join(' · '))
  if (c.projectId) lines.push(`project: ${oneLine(c.projectId)}`)
  if (c.agentId) lines.push(`agent: ${oneLine(c.agentId)}`)
  if (c.selection) lines.push(`selection: ${oneLine(c.selection)}`)
  const filters = Object.entries(c.filters).map(([k, v]) => `${oneLine(k)}=${oneLine(v)}`).filter((s) => !s.endsWith('='))
  if (filters.length) lines.push(`filters: ${filters.join('; ')}`)
  const visible = joinList(c.visibleState)
  if (visible) lines.push(`visible: ${visible}`)
  const blockers = joinList(c.blockers)
  if (blockers) lines.push(`blockers: ${blockers}`)
  lines.push(CONTEXT_CLOSE)
  return `${lines.join('\n')}\n\n${turn.text.trim()}`
}

/**
 * What a NEW Hermes session is seeded with, once: the phone's recent turns,
 * as Hermes' `session.create` takes them (`messages: [{role, content}]`). The
 * phone appends the message it is sending before it asks, so a trailing user
 * turn equal to the current text is the current text and is left out.
 * A resumed session already holds the conversation and gets nothing.
 */
export function seedMessages(history: CrowHistoryTurn[], currentText: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const turns = history
    .filter((t) => (t.role === 'user' || t.role === 'agent') && typeof t.text === 'string' && t.text.trim())
  const last = turns[turns.length - 1]
  if (last && last.role === 'user' && last.text.trim() === currentText.trim()) turns.pop()
  return turns.slice(-SEED_MAX).map((t) => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text.trim() }))
}
