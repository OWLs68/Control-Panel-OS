/**
 * THE boundary to Crow's brain.
 *
 * Every request to the agent in this app goes through `askCrow`, and nothing
 * else may talk to a gateway directly. `scripts/check-gateway-boundary.mjs`
 * enforces it in CI, the same way NeverMind guards `openaiFetch`.
 *
 * Replacing the stub with the real Hermes is `setGateway(liveGateway)` — one
 * line, one file, no screen touched.
 */
import { type CrowReply, type CrowRequest, type HermesGateway, type LiveSnapshot, GatewayError } from './contract.js'
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
