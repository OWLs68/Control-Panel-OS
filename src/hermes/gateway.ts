/**
 * THE boundary to Crow's brain.
 *
 * Every request to the agent in this app goes through `askCrow`, and nothing
 * else may talk to a gateway directly. `scripts/check-gateway-boundary.mjs`
 * enforces it in CI, the same way NeverMind guards `openaiFetch`.
 *
 * Replacing the stub with the real Hermes is `setGateway(createLiveGateway(…))`
 * — one line in the data-source switch, no screen touched. Both transports
 * that leave the phone live in this file: the snapshot (GET /api/v1/state)
 * and Crow (POST /api/v1/crow), because the boundary guard allows `fetch`
 * here and nowhere else.
 */
import { type CrowChip, type CrowReply, type CrowRequest, type HermesGateway, type LiveSnapshot, GatewayError } from './contract.js'
import { stubGateway } from './stub.js'
import type { MemoryFact } from '../data/types.js'

let gateway: HermesGateway = stubGateway

export function getGateway(): HermesGateway {
  return gateway
}

export function setGateway(next: HermesGateway): void {
  gateway = next
}

export async function askCrow(req: CrowRequest): Promise<CrowReply> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new GatewayError('offline', 'navigator reports offline')
  }
  const reply = await gateway.ask(req)
  return { ...reply, text: safeReply(reply.text) }
}

/**
 * Never show a raw JSON body as if Crow said it.
 *
 * Ported from NeverMind's `safeAgentReply`: when a model returns its internal
 * envelope instead of prose, the user sees a short confirmation, not a wall of
 * braces.
 */
export function safeReply(text: string): string {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return 'Готово.'
  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  if (!looksLikeJson) return trimmed
  try {
    JSON.parse(trimmed)
    return 'Зроблено ✓'
  } catch {
    return trimmed // not valid JSON after all — it was just prose in braces
  }
}

/* ── The snapshot transport ─────────────────────────────────────────────
 *
 * The live data adapter reads GET /api/v1/state through here and nowhere
 * else: the boundary guard allows `fetch` in this file only, and that is the
 * point — one door for everything that leaves the app.
 */

const STATE_PATH = '/api/v1/state'
const SNAPSHOT_TIMEOUT_MS = 8_000
const MEMORY_CATEGORIES = new Set(['system', 'project', 'person', 'preference'])

/**
 * The gateway address as Roman typed it, cleaned, or null if it is not one we
 * would ever call: https only (loopback may be plain http, for a build run on
 * the Mac itself), no credentials in it, no query, no fragment.
 */
export function normalizeGatewayUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let url: URL
  try { url = new URL(trimmed) } catch { return null }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null
  if (url.username || url.password) return null
  url.search = ''
  url.hash = ''
  return url.href.replace(/\/+$/, '')
}

export async function fetchSnapshot(gatewayUrl: string): Promise<LiveSnapshot> {
  const base = normalizeGatewayUrl(gatewayUrl)
  if (!base) throw new GatewayError('not-configured', 'no gateway url')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new GatewayError('offline', 'navigator reports offline')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${base}${STATE_PATH}`, { signal: controller.signal, cache: 'no-store' })
  } catch (err) {
    // DNS that does not resolve without the VPN, a Mac that is asleep, a
    // timeout — all the same thing from the phone's side.
    throw new GatewayError('unreachable', err instanceof Error ? err.message : 'network')
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 || res.status === 403) throw new GatewayError('unauthorized', `http ${res.status}`)
  if (res.status === 429) throw new GatewayError('rate-limited', 'http 429')
  if (!res.ok) throw new GatewayError('unreachable', `http ${res.status}`)

  let body: unknown
  try { body = await res.json() } catch { throw new GatewayError('bad-response', 'not json') }
  const snapshot = parseSnapshot(body)
  if (!snapshot) throw new GatewayError('bad-response', 'unexpected shape')
  return snapshot
}

/** Accepts only the shape the phone will render; anything else is not a snapshot. */
export function parseSnapshot(body: unknown): LiveSnapshot | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.memory)) return null
  if (typeof b.fetchedAt !== 'number' || !Number.isFinite(b.fetchedAt)) return null
  if (typeof b.source !== 'string' || !b.source) return null
  const memory: MemoryFact[] = []
  for (const row of b.memory) {
    if (!isMemoryFact(row)) return null
    memory.push(row)
  }
  return { memory, fetchedAt: b.fetchedAt, source: b.source }
}

function isMemoryFact(row: unknown): row is MemoryFact {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  const nullableString = (v: unknown) => v === null || typeof v === 'string'
  return typeof r.id === 'string' && r.id.length > 0
    && typeof r.text === 'string' && r.text.length > 0
    && typeof r.category === 'string' && MEMORY_CATEGORIES.has(r.category)
    && typeof r.ts === 'number' && Number.isFinite(r.ts)
    && typeof r.created_at === 'string' && typeof r.updated_at === 'string'
    && nullableString(r.deleted_at) && nullableString(r.user_id) && nullableString(r.hlc)
}

/* ── The Crow transport ───────────────────────────────────────────────
 *
 * Live mode: askCrow → liveGateway.ask → POST /api/v1/crow on the Roma
 * gateway → Hermes on the Mac → one reply. The phone sends the CrowRequest
 * as it is and accepts only a CrowReply back; every failure is named with
 * the same kinds the snapshot uses, so the chat says what the memory screen
 * says. No token, no Hermes address, nothing but the gateway's hostname.
 */

const CROW_PATH = '/api/v1/crow'
/** Past the gateway's own turn timeout (120 s), so the gateway names a slow turn before the phone gives up. */
const CROW_TIMEOUT_MS = 150_000
const CHIP_ACTIONS = new Set(['nav', 'chat', 'open'])
const CHIP_TONES = new Set(['neutral', 'accent', 'danger'])
const PRIORITIES = new Set(['normal', 'urgent', 'success'])

/** The address is read when a question is asked, not when the gateway is made: Roman may retype it. */
export function createLiveGateway(getUrl: () => string): HermesGateway {
  return {
    mode: 'live',
    label: 'Hermes через gateway',
    ask: (req) => postCrow(getUrl(), req),
  }
}

export async function postCrow(gatewayUrl: string, req: CrowRequest): Promise<CrowReply> {
  const base = normalizeGatewayUrl(gatewayUrl)
  if (!base) throw new GatewayError('not-configured', 'no gateway url')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CROW_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${base}${CROW_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (err) {
    throw new GatewayError('unreachable', err instanceof Error ? err.message : 'network')
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 || res.status === 403) throw new GatewayError('unauthorized', `http ${res.status}`)
  // 409 is the gateway's «a turn is already running»; 429 is too many — both mean «wait a moment».
  if (res.status === 409 || res.status === 429) throw new GatewayError('rate-limited', `http ${res.status}`)
  // 400 / 413: the phone sent something the gateway will not take — a shape problem on our side, not Hermes'.
  if (res.status >= 400 && res.status < 500) throw new GatewayError('bad-response', `http ${res.status}`)
  // 501 (not wired), 502 (Hermes down or failed), 504 (turn timed out): Hermes is not answering.
  if (!res.ok) throw new GatewayError('unreachable', `http ${res.status}`)

  let body: unknown
  try { body = await res.json() } catch { throw new GatewayError('bad-response', 'not json') }
  const reply = parseCrowReply(body)
  if (!reply) throw new GatewayError('bad-response', 'unexpected shape')
  if (reply.requestId !== req.requestId) throw new GatewayError('bad-response', 'reply to another request')
  return reply
}

/** Accepts only a CrowReply; the text may be empty (safeReply turns it into something sayable). */
export function parseCrowReply(body: unknown): CrowReply | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.requestId !== 'string' || !b.requestId) return null
  if (typeof b.text !== 'string') return null
  if (!Array.isArray(b.chips)) return null
  if (typeof b.priority !== 'string' || !PRIORITIES.has(b.priority)) return null
  if (b.forModule !== undefined && typeof b.forModule !== 'string') return null
  const chips: CrowChip[] = []
  for (const row of b.chips) {
    if (!isCrowChip(row)) return null
    chips.push(row)
  }
  const reply: CrowReply = { requestId: b.requestId, text: b.text, chips, priority: b.priority as CrowReply['priority'] }
  if (typeof b.forModule === 'string') reply.forModule = b.forModule
  return reply
}

function isCrowChip(row: unknown): row is CrowChip {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  return typeof r.id === 'string' && r.id.length > 0
    && typeof r.label === 'string' && r.label.length > 0
    && typeof r.action === 'string' && CHIP_ACTIONS.has(r.action)
    && (r.target === undefined || typeof r.target === 'string')
    && (r.tone === undefined || (typeof r.tone === 'string' && CHIP_TONES.has(r.tone)))
}
