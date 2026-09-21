/**
 * POST /api/v1/crow — the phone's question, checked, bounded, answered once.
 *
 * The phone sends `CrowRequest` (src/hermes/contract.ts): text, the UI
 * context envelope, the recent turns and a request id. Everything is
 * validated at runtime and cut to size before Hermes sees any of it: a body
 * is 256 KB at most, a question 4000 characters, the history twenty turns,
 * every context string 300 characters. What comes back is one `CrowReply`
 * with the text, no chips and normal priority — the first slice.
 *
 * Failures are named, not described: the phone gets a status and a short
 * error code, never a stack trace, never a Hermes message.
 */
import type { IncomingMessage } from 'node:http'
import { HermesError, type CrowContext, type CrowHistoryTurn, type CrowTurnInput } from './hermes-protocol.ts'

export const CROW_LIMITS = {
  bodyBytes: 256 * 1024,
  text: 4_000,
  historyTurns: 20,
  historyText: 2_000,
  contextString: 300,
  contextItems: 20,
  filters: 20,
  requestId: 128,
} as const

export interface CrowReply {
  requestId: string
  text: string
  chips: never[]
  priority: 'normal'
}

export type BodyRead = { ok: true; text: string } | { ok: false; status: 400 | 413; error: 'bad_request' | 'too_large' }

/** The whole body, or a 413 the moment it grows past the limit (the rest is drained and dropped). */
export function readBody(req: IncomingMessage, limit: number = CROW_LIMITS.bodyBytes): Promise<BodyRead> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const finish = (result: BodyRead) => { if (!done) { done = true; resolve(result) } }
    req.on('data', (chunk: Buffer) => {
      if (done) return
      size += chunk.length
      if (size > limit) {
        chunks.length = 0
        req.resume()
        finish({ ok: false, status: 413, error: 'too_large' })
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') }))
    req.on('error', () => finish({ ok: false, status: 400, error: 'bad_request' }))
  })
}

export type CrowParse =
  | { ok: true; turn: CrowTurnInput }
  | { ok: false; status: 400 | 413; error: 'bad_request' | 'empty_text' | 'too_large' }

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function clip(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v
}

function parseContext(raw: Record<string, unknown>): CrowContext | null {
  if (typeof raw.activeModule !== 'string' || !raw.activeModule.trim()) return null
  const str = (v: unknown) => (typeof v === 'string' ? clip(v, CROW_LIMITS.contextString) : '')
  const nullable = (v: unknown) => (typeof v === 'string' && v.trim() ? clip(v, CROW_LIMITS.contextString) : null)
  const list = (v: unknown) => (Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, CROW_LIMITS.contextItems).map((s) => clip(s, CROW_LIMITS.contextString))
    : [])
  const filters: Record<string, string> = {}
  if (isRecord(raw.filters)) {
    for (const [k, v] of Object.entries(raw.filters)) {
      if (Object.keys(filters).length >= CROW_LIMITS.filters) break
      if (k && typeof v === 'string') filters[clip(k, 64)] = clip(v, CROW_LIMITS.contextString)
    }
  }
  return {
    activeModule: str(raw.activeModule),
    activeScreen: str(raw.activeScreen),
    activeEntity: nullable(raw.activeEntity),
    selectedItem: nullable(raw.selectedItem),
    projectId: nullable(raw.projectId),
    agentId: nullable(raw.agentId),
    filters,
    visibleState: list(raw.visibleState),
    blockers: list(raw.blockers),
    selection: nullable(raw.selection),
  }
}

function parseHistory(raw: unknown): CrowHistoryTurn[] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  const turns: CrowHistoryTurn[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const role = item.role
    if ((role !== 'user' && role !== 'agent') || typeof item.text !== 'string' || !item.text.trim()) continue
    const ts = typeof item.ts === 'number' && Number.isFinite(item.ts) ? item.ts : 0
    turns.push({ role, text: clip(item.text, CROW_LIMITS.historyText), ts })
  }
  return turns.slice(-CROW_LIMITS.historyTurns)
}

/** The request body as text → a bounded `CrowTurnInput`, or the status to answer with. */
export function parseCrowRequest(body: string): CrowParse {
  const bad = { ok: false as const, status: 400 as const, error: 'bad_request' as const }
  let obj: unknown
  try { obj = JSON.parse(body) } catch { return bad }
  if (!isRecord(obj)) return bad
  const requestId = obj.requestId
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > CROW_LIMITS.requestId) return bad
  if (typeof obj.text !== 'string') return bad
  const text = obj.text.trim()
  if (!text) return { ok: false, status: 400, error: 'empty_text' }
  if (text.length > CROW_LIMITS.text) return { ok: false, status: 413, error: 'too_large' }
  if (!isRecord(obj.context)) return bad
  const context = parseContext(obj.context)
  if (!context) return bad
  const history = parseHistory(obj.history)
  if (!history) return bad
  return { ok: true, turn: { text, context, history, requestId } }
}

export function crowReply(turn: CrowTurnInput, text: string): CrowReply {
  return { requestId: turn.requestId, text, chips: [], priority: 'normal' }
}

/** Status and error code for a failed turn. Nothing of the cause travels to the phone. */
export function crowFailure(err: unknown): { status: number; error: string } {
  if (err instanceof HermesError) {
    switch (err.kind) {
      case 'busy': return { status: 409, error: 'busy' }
      case 'timeout': return { status: 504, error: 'hermes_timeout' }
      case 'unavailable': return { status: 502, error: 'hermes_unavailable' }
      case 'protocol': return { status: 502, error: 'hermes_bad_response' }
      case 'failed': return { status: 502, error: 'hermes_failed' }
    }
  }
  return { status: 500, error: 'internal' }
}
