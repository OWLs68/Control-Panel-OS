/**
 * POST /api/v1/crow over a loopback socket: what the phone may send, what it
 * gets back, and what each failure is called. The brain is a fake here; the
 * last test wires the real client to the fake Hermes to prove the seam.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { configFromEnv, createHandler, hermesConfigFromEnv } from '../src/index.ts'
import { CROW_LIMITS, parseCrowRequest } from '../src/crow.ts'
import { createHermesClient, type CrowBrain } from '../src/hermes-client.ts'
import { HermesError, type CrowTurnInput } from '../src/hermes-protocol.ts'
import { memorySessionStore } from '../src/session-state.ts'
import { FakeHermes } from './fake-hermes.ts'

const ORIGIN = 'https://owls68.github.io'
const LOGIN = 'roman@example.com'
const HEADERS = { 'tailscale-user-login': LOGIN, origin: ORIGIN, 'content-type': 'application/json' }

const CONTEXT = {
  activeModule: 'projects', activeScreen: 'detail', activeEntity: 'blocker', selectedItem: 'b-1',
  projectId: 'p-1', agentId: null, filters: { status: 'open' }, visibleState: ['NeverMind 60%'], blockers: [], selection: 'Окремі ключі',
}
const REQUEST = { text: 'А чого це заблоковано?', context: CONTEXT, history: [{ role: 'user', text: 'Привіт', ts: 1 }], requestId: 'req-1' }

interface Brain extends CrowBrain {
  turns: CrowTurnInput[]
  next: ((turn: CrowTurnInput, signal?: AbortSignal) => Promise<{ text: string }>) | null
  busyFlag: boolean
}

function fakeBrain(): Brain {
  const brain: Brain = {
    turns: [],
    next: null,
    busyFlag: false,
    get busy() { return brain.busyFlag },
    async ask(turn, signal) {
      brain.turns.push(turn)
      if (brain.next) return brain.next(turn, signal)
      return { text: `відповідь на «${turn.text}»` }
    },
    async close() {},
  }
  return brain
}

let server: Server
let base = ''
const brain = fakeBrain()
let stateCalls = 0

before(async () => {
  const config = configFromEnv({ ROMA_ALLOWED_LOGINS: LOGIN, ROMA_ALLOWED_ORIGINS: ORIGIN })
  const handler = createHandler(config, async () => { stateCalls++; return { memory: [], fetchedAt: 1, source: 'gbrain:recall', dropped: 0 } }, brain)
  server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no port')
  base = `http://127.0.0.1:${addr.port}`
})

after(() => server.close())

const post = (body: unknown, init: RequestInit = {}) => fetch(`${base}/api/v1/crow`, {
  method: 'POST', headers: HEADERS, body: typeof body === 'string' ? body : JSON.stringify(body), ...init,
})

test('only POST, only with an identity', async () => {
  assert.equal((await post(REQUEST, { headers: { 'content-type': 'application/json' } })).status, 403)
  const get = await fetch(`${base}/api/v1/crow`, { headers: HEADERS })
  assert.equal(get.status, 405)
  assert.equal(get.headers.get('allow'), 'POST')
  assert.deepEqual(await get.json(), { error: 'method_not_allowed' })
})

test('a good question gets one reply: text, no chips, normal priority, our CORS', async () => {
  brain.turns = []
  const res = await post(REQUEST)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await res.json(), { requestId: 'req-1', text: 'відповідь на «А чого це заблоковано?»', chips: [], priority: 'normal' })
  assert.equal(brain.turns.length, 1)
  assert.deepEqual(brain.turns[0]?.context, CONTEXT)
  assert.deepEqual(brain.turns[0]?.history, [{ role: 'user', text: 'Привіт', ts: 1 }])
})

test('what the phone sends is cut to size before Hermes sees it', async () => {
  brain.turns = []
  const res = await post({
    ...REQUEST,
    text: '  з пробілами  ',
    context: {
      ...CONTEXT,
      selection: 'x'.repeat(1_000),
      visibleState: Array.from({ length: 40 }, (_, i) => `v${i}`).concat([42 as unknown as string, '  ']),
      filters: { a: 'ok', b: 7, c: ['no'] },
      agentId: 12,
      extra: 'ignored',
    },
    history: [
      ...Array.from({ length: 30 }, (_, i) => ({ role: 'agent', text: `h${i}`, ts: i })),
      { role: 'system', text: 'nope', ts: 1 }, { role: 'user', text: '', ts: 1 }, 'junk', { role: 'user', text: 'y'.repeat(5_000), ts: 'soon' },
    ],
  })
  assert.equal(res.status, 200)
  const turn = brain.turns[0]
  assert.equal(turn?.text, 'з пробілами')
  assert.equal(turn?.context.selection?.length, CROW_LIMITS.contextString)
  assert.equal(turn?.context.visibleState.length, CROW_LIMITS.contextItems)
  assert.deepEqual(turn?.context.filters, { a: 'ok' })
  assert.equal(turn?.context.agentId, null)
  assert.equal('extra' in (turn?.context ?? {}), false)
  assert.equal(turn?.history.length, CROW_LIMITS.historyTurns)
  const last = turn?.history[turn.history.length - 1]
  assert.equal(last?.role, 'user')
  assert.equal(last?.text.length, CROW_LIMITS.historyText)
  assert.equal(last?.ts, 0)
})

test('a bad body is 400, an empty question is 400 empty_text, an oversized one is 413', async () => {
  assert.deepEqual([(await post('{not json')).status, await (await post('{not json')).json()], [400, { error: 'bad_request' }])
  assert.equal((await post('[]')).status, 400)
  assert.equal((await post({ ...REQUEST, requestId: undefined })).status, 400)
  assert.equal((await post({ ...REQUEST, requestId: 'r'.repeat(200) })).status, 400)
  assert.equal((await post({ ...REQUEST, text: 42 })).status, 400)
  assert.equal((await post({ ...REQUEST, context: 'projects' })).status, 400)
  assert.equal((await post({ ...REQUEST, context: { ...CONTEXT, activeModule: '' } })).status, 400)
  assert.equal((await post({ ...REQUEST, history: 'none' })).status, 400)
  const empty = await post({ ...REQUEST, text: '   ' })
  assert.equal(empty.status, 400)
  assert.deepEqual(await empty.json(), { error: 'empty_text' })
  const long = await post({ ...REQUEST, text: 'а'.repeat(CROW_LIMITS.text + 1) })
  assert.equal(long.status, 413)
  assert.deepEqual(await long.json(), { error: 'too_large' })
  const huge = await post(JSON.stringify({ ...REQUEST, history: [{ role: 'user', text: 'x'.repeat(CROW_LIMITS.bodyBytes + 1_000), ts: 1 }] }))
  assert.equal(huge.status, 413)
  assert.deepEqual(await huge.json(), { error: 'too_large' })
  // A history without a field at all is fine: the phone may have nothing to say yet.
  assert.equal((await post({ ...REQUEST, history: undefined })).status, 200)
})

test('busy is 409 and the brain is not asked; each Hermes failure has its status and no detail', async () => {
  brain.turns = []
  brain.busyFlag = true
  const busy = await post(REQUEST)
  assert.equal(busy.status, 409)
  assert.deepEqual(await busy.json(), { error: 'busy' })
  assert.equal(brain.turns.length, 0)
  brain.busyFlag = false

  const cases: Array<[HermesError['kind'] | 'plain', number, string]> = [
    ['busy', 409, 'busy'], ['unavailable', 502, 'hermes_unavailable'], ['protocol', 502, 'hermes_bad_response'],
    ['failed', 502, 'hermes_failed'], ['timeout', 504, 'hermes_timeout'], ['plain', 500, 'internal'],
  ]
  for (const [k, status, error] of cases) {
    brain.next = async () => { throw k === 'plain' ? new Error('stack trace with secrets') : new HermesError(k, 'internal detail with token-like text') }
    const res = await post(REQUEST)
    assert.equal(res.status, status, k)
    const body = await res.text()
    assert.deepEqual(JSON.parse(body), { error })
    assert.ok(!body.includes('detail') && !body.includes('stack'))
  }
  brain.next = null
})

test('a phone that goes away mid-turn aborts the turn', async () => {
  let aborted = false
  let started!: () => void
  const running = new Promise<void>((r) => { started = r })
  brain.next = (_turn, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => { aborted = true; reject(new HermesError('failed', 'aborted')) })
    started()
  })
  const ac = new AbortController()
  const req = post(REQUEST, { signal: ac.signal }).catch(() => 'aborted')
  await running
  ac.abort()
  assert.equal(await req, 'aborted')
  const until = Date.now() + 2_000
  while (!aborted && Date.now() < until) await new Promise((r) => setTimeout(r, 10))
  assert.equal(aborted, true)
  brain.next = null
})

test('GET /api/v1/state is untouched by the Crow route', async () => {
  const before = stateCalls
  const res = await fetch(`${base}/api/v1/state`, { headers: HEADERS })
  assert.equal(res.status, 200)
  assert.equal(stateCalls, before + 1)
  assert.deepEqual(Object.keys(await res.json() as object).sort(), ['dropped', 'fetchedAt', 'memory', 'source'])
})

test('parseCrowRequest alone: the shapes it accepts and refuses', () => {
  const ok = parseCrowRequest(JSON.stringify(REQUEST))
  assert.equal(ok.ok, true)
  assert.equal(parseCrowRequest('null').ok, false)
  assert.equal(parseCrowRequest(JSON.stringify({ ...REQUEST, text: '' })).ok, false)
  const noHistory = parseCrowRequest(JSON.stringify({ text: 'x', context: { activeModule: 'control' }, requestId: 'r' }))
  assert.equal(noHistory.ok, true)
  if (noHistory.ok) {
    assert.deepEqual(noHistory.turn.history, [])
    assert.deepEqual(noHistory.turn.context, { activeModule: 'control', activeScreen: '', activeEntity: null, selectedItem: null, projectId: null, agentId: null, filters: {}, visibleState: [], blockers: [], selection: null })
  }
})

test('hermesConfigFromEnv: off without a token file, defaults otherwise', () => {
  assert.equal(hermesConfigFromEnv({}), null)
  assert.equal(hermesConfigFromEnv({ HERMES_TOKEN_FILE: '  ' }), null)
  assert.deepEqual(hermesConfigFromEnv({ HERMES_TOKEN_FILE: '~/.hermes/roma-crow-token' }), {
    wsUrl: 'ws://127.0.0.1:9119/api/ws', tokenFile: '~/.hermes/roma-crow-token',
    sessionStateFile: '~/.roma-gateway/hermes-session.json', connectTimeoutMs: 5_000, turnTimeoutMs: 120_000,
  })
  const custom = hermesConfigFromEnv({ HERMES_TOKEN_FILE: '/t', HERMES_WS_URL: 'ws://127.0.0.1:9999/api/ws', HERMES_SESSION_STATE_FILE: '/s.json', HERMES_CONNECT_TIMEOUT_MS: '2500', HERMES_TURN_TIMEOUT_MS: 'nope' })
  assert.equal(custom?.wsUrl, 'ws://127.0.0.1:9999/api/ws')
  assert.equal(custom?.sessionStateFile, '/s.json')
  assert.equal(custom?.connectTimeoutMs, 2_500)
  assert.equal(custom?.turnTimeoutMs, 120_000)
})

test('the whole seam: POST → real client → fake Hermes → one reply; Hermes down → 502, never a stub', async () => {
  const fake = new FakeHermes('tok-seam')
  await fake.start()
  const store = memorySessionStore()
  const client = createHermesClient(
    { wsUrl: fake.url, tokenFile: '/nowhere', connectTimeoutMs: 1_000, turnTimeoutMs: 5_000 },
    { store, readToken: async () => 'tok-seam', log: () => {} },
  )
  const config = configFromEnv({ ROMA_ALLOWED_LOGINS: LOGIN, ROMA_ALLOWED_ORIGINS: ORIGIN })
  const handler = createHandler(config, async () => ({ memory: [], fetchedAt: 1, source: 'gbrain:recall', dropped: 0 }), client)
  const srv = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  const addr = srv.address()
  const url = `http://127.0.0.1:${addr && typeof addr !== 'string' ? addr.port : 0}/api/v1/crow`
  try {
    const res = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(REQUEST) })
    assert.equal(res.status, 200)
    const body = await res.json() as { text: string; requestId: string; chips: unknown[]; priority: string }
    assert.equal(body.text, 'Маркер: VIOLET-624')
    assert.equal(body.requestId, 'req-1')
    assert.deepEqual(body.chips, [])
    assert.equal(body.priority, 'normal')
    assert.equal(store.value, 'key-1')
    assert.ok(String(fake.callsTo('prompt.submit')[0]?.params.text).endsWith('\n\nА чого це заблоковано?'))
    assert.deepEqual(fake.callsTo('session.create')[0]?.params.messages, [{ role: 'user', content: 'Привіт' }])

    await fake.stop()
    const down = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(REQUEST) })
    assert.equal(down.status, 502)
    assert.deepEqual(await down.json(), { error: 'hermes_unavailable' })
  } finally {
    await client.close()
    srv.close()
    await fake.stop()
  }
})
