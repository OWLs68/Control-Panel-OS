import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { configFromEnv, createHandler } from '../src/index.ts'
import { createStateBuilder, type FactsReader } from '../src/state.ts'
import { mapFacts } from '../src/mapping.ts'

const ROW = { id: 78, fact_id: '78', fact: 'факт', kind: 'preference', entity_slug: 'roman-ai-os', valid_from: '2026-09-20T22:53:17.918Z', created_at: '2026-09-20T22:53:19.774Z' }

let server: Server
let base = ''
let failNext = false
let readerCalls = 0

const reader: FactsReader = {
  async recentFacts() {
    readerCalls++
    if (failNext) { failNext = false; throw new Error('gbrain down') }
    return [ROW, { junk: true }]
  },
}

const ORIGIN = 'https://owls68.github.io'
const LOGIN = 'roman@example.com'

before(async () => {
  const config = configFromEnv({ ROMA_ALLOWED_LOGINS: LOGIN, ROMA_ALLOWED_ORIGINS: ORIGIN, GBRAIN_RECALL_LIMIT: '5' })
  let clock = 1_000_000
  const buildState = createStateBuilder(reader, mapFacts, config.recallLimit, () => (clock += 20_000))
  const handler = createHandler(config, buildState)
  server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no port')
  base = `http://127.0.0.1:${addr.port}`
})

after(() => server.close())

test('health needs no identity and carries no data', async () => {
  const res = await fetch(`${base}/api/v1/health`)
  assert.equal(res.status, 200)
  const body = await res.json() as { ok: boolean; memory?: unknown }
  assert.equal(body.ok, true)
  assert.equal(body.memory, undefined)
})

test('state without a Tailscale identity is 403, and so is a stranger', async () => {
  assert.equal((await fetch(`${base}/api/v1/state`)).status, 403)
  assert.equal((await fetch(`${base}/api/v1/state`, { headers: { 'tailscale-user-login': 'x@y.z' } })).status, 403)
})

test('state for the allowed login carries memory only, mapped, with CORS for our origin', async () => {
  const res = await fetch(`${base}/api/v1/state`, { headers: { 'tailscale-user-login': LOGIN, origin: ORIGIN } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json() as Record<string, unknown>
  assert.deepEqual(Object.keys(body).sort(), ['dropped', 'fetchedAt', 'memory', 'source'])
  assert.equal(body.source, 'gbrain:recall')
  assert.equal(body.dropped, 1)
  const memory = body.memory as Array<{ id: string; category: string }>
  assert.equal(memory.length, 1)
  assert.equal(memory[0]?.id, '78')
  assert.equal(memory[0]?.category, 'preference')
  assert.equal('agents' in body, false)
  assert.equal('projects' in body, false)
})

test('a foreign origin gets the data but no CORS header, so the browser blocks it', async () => {
  const res = await fetch(`${base}/api/v1/state`, { headers: { 'tailscale-user-login': LOGIN, origin: 'https://evil.test' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), null)
})

test('preflight for our origin is 204; for a stranger 403', async () => {
  const ok = await fetch(`${base}/api/v1/crow`, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } })
  assert.equal(ok.status, 204)
  assert.equal(ok.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS')
  const bad = await fetch(`${base}/api/v1/crow`, { method: 'OPTIONS', headers: { origin: 'https://evil.test' } })
  assert.equal(bad.status, 403)
})

test('without Hermes configured, crow is a 501 seam behind the same identity check', async () => {
  assert.equal((await fetch(`${base}/api/v1/crow`, { method: 'POST' })).status, 403)
  const res = await fetch(`${base}/api/v1/crow`, { method: 'POST', headers: { 'tailscale-user-login': LOGIN } })
  assert.equal(res.status, 501)
  assert.equal((await res.json() as { error: string }).error, 'not_implemented')
})

test('when GBrain fails the answer is 502, never a fake snapshot', async () => {
  failNext = true
  const res = await fetch(`${base}/api/v1/state`, { headers: { 'tailscale-user-login': LOGIN } })
  assert.equal(res.status, 502)
  assert.deepEqual(await res.json(), { error: 'gbrain_unavailable' })
})

test('the snapshot cache holds for a burst, and unknown paths are 404', async () => {
  const before = readerCalls
  await fetch(`${base}/api/v1/state`, { headers: { 'tailscale-user-login': LOGIN } })
  await fetch(`${base}/api/v1/state`, { headers: { 'tailscale-user-login': LOGIN } })
  assert.ok(readerCalls - before >= 1)
  assert.equal((await fetch(`${base}/api/v1/nope`, { headers: { 'tailscale-user-login': LOGIN } })).status, 404)
})
