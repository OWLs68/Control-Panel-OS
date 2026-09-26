import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { configFromEnv, createHandler, eventsConfigFromEnv, type EventCenter } from '../src/index.ts'
import { createStateBuilder, type FactsReader } from '../src/state.ts'
import { mapFacts } from '../src/mapping.ts'
import { EVENT_LIMITS, memoryEventStore, tokenMatches } from '../src/events.ts'

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

// A second gateway with the Event Center on: an in-memory store and a fixed producer token.
const TOKEN = 'producer-TOKEN-1'
const eventStore = memoryEventStore()
let tokenReadable = true
const center: EventCenter = {
  store: eventStore,
  async authorize(token) {
    if (!tokenReadable) throw new Error('token file not found (/x)')
    return tokenMatches(token, TOKEN)
  },
}
let evServer: Server
let evBase = ''

before(async () => {
  const config = configFromEnv({ ROMA_ALLOWED_LOGINS: LOGIN, ROMA_ALLOWED_ORIGINS: ORIGIN, GBRAIN_RECALL_LIMIT: '5' })
  const buildState = createStateBuilder(reader, mapFacts, config.recallLimit, Date.now, { reader: eventStore, limit: EVENT_LIMITS.inSnapshot })
  const handler = createHandler(config, buildState, null, center)
  evServer = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>((r) => evServer.listen(0, '127.0.0.1', r))
  const addr = evServer.address()
  if (!addr || typeof addr === 'string') throw new Error('no port')
  evBase = `http://127.0.0.1:${addr.port}`
})

after(() => evServer.close())

function postEvent(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) {
  return fetch(`${evBase}/api/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

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

test('the Event Center is off without its token file: events are a 501 seam and the snapshot has no events key', async () => {
  assert.equal(eventsConfigFromEnv({}), null)
  assert.deepEqual(eventsConfigFromEnv({ ROMA_EVENTS_TOKEN_FILE: ' ~/t ' }), { file: '~/.roma-gateway/events.json', tokenFile: '~/t' })
  const res = await fetch(`${base}/api/v1/events`, { method: 'POST', body: '{}' })
  assert.equal(res.status, 501)
  const state = await (await fetch(`${base}/api/v1/state`, { headers: { 'tailscale-user-login': LOGIN } })).json() as Record<string, unknown>
  assert.equal('events' in state, false)
})

test('a producer on the Mac writes with its token, and the phone reads the event in the snapshot', async () => {
  const res = await postEvent({ id: 'curl:test:1', kind: 'alert', title: 'Тест з Mac', source: 'curl', needsRoman: true })
  assert.equal(res.status, 201)
  assert.deepEqual(await res.json(), { id: 'curl:test:1', duplicate: false })

  const state = await fetch(`${evBase}/api/v1/state`, { headers: { 'tailscale-user-login': LOGIN, origin: ORIGIN } })
  assert.equal(state.status, 200)
  const body = await state.json() as { events: Array<Record<string, unknown>>; memory: unknown[] }
  assert.equal(body.memory.length, 1)
  const ev = body.events.find((e) => e.id === 'curl:test:1')
  assert.ok(ev)
  assert.equal(ev.kind, 'alert')
  assert.equal(ev.title, 'Тест з Mac')
  assert.equal(ev.needsRoman, true)
  assert.equal(ev.severity, 'info')
  assert.equal(typeof ev.ts, 'number')
})

test('the same id again changes nothing: 200, marked duplicate', async () => {
  await postEvent({ id: 'curl:test:2', kind: 'agent_finished', title: 'Раз', source: 'curl' })
  const again = await postEvent({ id: 'curl:test:2', kind: 'agent_finished', title: 'Два', source: 'curl' })
  assert.equal(again.status, 200)
  assert.deepEqual(await again.json(), { id: 'curl:test:2', duplicate: true })
  assert.equal(eventStore.events.filter((e) => e.id === 'curl:test:2').length, 1)
  assert.equal(eventStore.events.find((e) => e.id === 'curl:test:2')?.title, 'Раз')
})

test('no token or a wrong one is 401; anything through Serve is 403, token or not; only POST', async () => {
  const count = eventStore.events.length
  assert.equal((await postEvent({ kind: 'alert', title: 't', source: 's' }, {})).status, 401)
  assert.equal((await postEvent({ kind: 'alert', title: 't', source: 's' }, { authorization: 'Bearer nope' })).status, 401)
  const viaServe = await postEvent({ kind: 'alert', title: 't', source: 's' }, { authorization: `Bearer ${TOKEN}`, 'tailscale-user-login': LOGIN })
  assert.equal(viaServe.status, 403)
  const get = await fetch(`${evBase}/api/v1/events`, { headers: { authorization: `Bearer ${TOKEN}` } })
  assert.equal(get.status, 405)
  assert.equal(get.headers.get('allow'), 'POST')
  assert.equal(eventStore.events.length, count)
})

test('a bad event names its field; a body too big is 413; neither is stored', async () => {
  const count = eventStore.events.length
  const bad = await postEvent({ kind: 'needs_roman', title: 't', source: 's' })
  assert.equal(bad.status, 400)
  assert.deepEqual(await bad.json(), { error: 'invalid_event', field: 'kind' })
  assert.equal((await postEvent('{nope')).status, 400)
  const big = await postEvent({ kind: 'alert', title: 't', source: 's', detail: 'x'.repeat(EVENT_LIMITS.bodyBytes + 10) })
  assert.equal(big.status, 413)
  assert.equal(eventStore.events.length, count)
})

test('a producer token that cannot be read is 503, and nothing is written', async () => {
  tokenReadable = false
  try {
    const res = await postEvent({ kind: 'alert', title: 't', source: 's' })
    assert.equal(res.status, 503)
    assert.deepEqual(await res.json(), { error: 'events_unavailable' })
  } finally {
    tokenReadable = true
  }
})
