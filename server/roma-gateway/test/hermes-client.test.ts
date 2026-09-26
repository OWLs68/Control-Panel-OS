/**
 * The Hermes client against a fake Hermes over a real WebSocket: the whole
 * lifecycle, and every way it is allowed to fail.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { FakeHermes } from './fake-hermes.ts'
import { createHermesClient, type CrowBrain, type HermesClientConfig } from '../src/hermes-client.ts'
import { memorySessionStore, type SessionStateStore } from '../src/session-state.ts'
import { CONTEXT_CLOSE, CONTEXT_OPEN, HermesError, type CrowContext, type CrowHistoryTurn } from '../src/hermes-protocol.ts'

const TOKEN = 'tok-SECRET-ABCDEF0123456789'
let fake: FakeHermes
let logs: string[]
let clients: CrowBrain[]

beforeEach(async () => {
  fake = new FakeHermes(TOKEN)
  await fake.start()
  logs = []
  clients = []
})

afterEach(async () => {
  for (const c of clients) await c.close()
  await fake.stop()
})

function client(store: SessionStateStore = memorySessionStore(), overrides: Partial<HermesClientConfig> = {}, token = TOKEN): CrowBrain {
  const c = createHermesClient(
    { wsUrl: fake.url, tokenFile: '/nowhere/roma-crow-token', connectTimeoutMs: 2_000, turnTimeoutMs: 5_000, ...overrides },
    { store, readToken: async () => token, log: (line) => logs.push(line) },
  )
  clients.push(c)
  return c
}

const CONTEXT: CrowContext = {
  activeModule: 'projects', activeScreen: 'detail', activeEntity: 'blocker', selectedItem: 'b-1',
  projectId: 'p-1', agentId: null, filters: {}, visibleState: ['NeverMind 60%'], blockers: [], selection: 'Окремі ключі',
}

function turn(text = 'Що каже GBrain?', history: CrowHistoryTurn[] = []) {
  return { text, context: CONTEXT, history, requestId: 'req-1' }
}

async function waitFor(pred: () => boolean, ms = 2_000): Promise<void> {
  const until = Date.now() + ms
  while (!pred()) {
    if (Date.now() > until) throw new Error('waitFor: gave up')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const kind = (k: HermesError['kind']) => (e: unknown) => e instanceof HermesError && e.kind === k

test('ready → session.create (close_on_disconnect=false) → prompt.submit → one clean reply; the stored id is kept', async () => {
  const store = memorySessionStore()
  const c = client(store)
  const reply = await c.ask(turn())
  assert.equal(reply.text, 'Маркер: VIOLET-624')
  assert.deepEqual(fake.calls.map((x) => x.method), ['session.create', 'prompt.submit'])
  const create = fake.callsTo('session.create')[0]?.params
  assert.equal(create?.close_on_disconnect, false)
  assert.equal(create?.title, 'Crow OS MP · Crow')
  assert.equal('messages' in (create ?? {}), false, 'no history → no seed')
  assert.equal(store.value, 'key-1')
  const submit = fake.callsTo('prompt.submit')[0]?.params
  assert.equal(submit?.session_id, 'sid-1')
  const prompt = String(submit?.text)
  assert.ok(prompt.startsWith(CONTEXT_OPEN))
  assert.ok(prompt.includes(`${CONTEXT_CLOSE}\n\nЩо каже GBrain?`))
  assert.ok(prompt.includes('selection: Окремі ключі'))
  assert.equal(c.busy, false)
})

test('the token goes into the upgrade URL and nowhere else', async () => {
  const c = client()
  await c.ask(turn())
  assert.deepEqual(fake.tokensSeen, [TOKEN])
  assert.ok(logs.length > 0)
  for (const line of logs) assert.ok(!line.includes(TOKEN), `token leaked into a log line: ${line}`)
  assert.ok(logs.some((l) => l.includes(`connecting to ${fake.url}`)), 'the address is logged without the query')
})

test('a wrong token is «unavailable», and the error names the file, not the value', async () => {
  const c = client(memorySessionStore(), {}, 'wrong-token-XYZ987')
  await assert.rejects(c.ask(turn()), (e: unknown) => {
    assert.ok(e instanceof HermesError)
    assert.equal(e.kind, 'unavailable')
    assert.ok(!e.message.includes('wrong-token-XYZ987'))
    return true
  })
  for (const line of logs) assert.ok(!line.includes('wrong-token-XYZ987'))
  assert.deepEqual(fake.callsTo('session.create'), [])
})

test('a second client with the same store resumes the stored session and never creates another', async () => {
  const store = memorySessionStore()
  await client(store).ask(turn('перше'))
  fake.calls = []
  const second = client(store)
  const reply = await second.ask(turn('друге'))
  assert.equal(reply.text, 'Маркер: VIOLET-624')
  assert.deepEqual(fake.calls.map((x) => x.method), ['session.resume', 'prompt.submit'])
  assert.deepEqual(fake.callsTo('session.resume')[0]?.params, { session_id: 'key-1', omit_messages: true })
  assert.equal(fake.callsTo('prompt.submit')[0]?.params.session_id, 'sid-1')
  assert.equal(store.value, 'key-1')
})

test('the same client reuses its session on the next turn — no resume, no create', async () => {
  const c = client()
  await c.ask(turn('перше'))
  await c.ask(turn('друге'))
  assert.deepEqual(fake.calls.map((x) => x.method), ['session.create', 'prompt.submit', 'prompt.submit'])
  assert.equal(fake.connections, 1)
})

test('deltas are assembled once: the final text wins when present, the stream when it is empty', async () => {
  fake.turn = ({ emit }) => {
    emit('message.delta', { text: 'Hello ' })
    emit('message.delta', { text: 'world' })
    emit('message.complete', { text: 'Hello world', status: 'complete' })
  }
  const c = client()
  assert.equal((await c.ask(turn())).text, 'Hello world')
  fake.turn = ({ emit }) => {
    emit('message.delta', { text: 'Hello ' })
    emit('message.delta', { text: 'stream' })
    emit('message.complete', { text: '', status: 'complete' })
  }
  assert.equal((await c.ask(turn())).text, 'Hello stream')
})

test('reasoning, thinking, tool and status events never reach the reply; another session\'s deltas neither', async () => {
  fake.turn = ({ emit, raw }) => {
    emit('message.start')
    emit('reasoning.delta', { text: 'SECRET reasoning' })
    emit('thinking.delta', { text: 'SECRET thinking' })
    emit('reasoning.available', { text: 'SECRET block' })
    emit('tool.start', { name: 'mcp__gbrain__recall', tool_id: 't', args: {} })
    emit('tool.generating', { name: 'mcp__gbrain__recall' })
    emit('tool.complete', { name: 'mcp__gbrain__recall', tool_id: 't', result: 'SECRET tool output' })
    emit('status.update', { kind: 'status', text: 'SECRET status' })
    emit('message.interim', { text: 'SECRET interim', already_streamed: false })
    raw(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'other-session', payload: { text: 'SECRET other' } } }))
    emit('message.delta', { text: 'ok' })
    emit('message.complete', { text: '', status: 'complete' })
  }
  const c = client()
  const reply = await c.ask(turn())
  assert.equal(reply.text, 'ok')
})

test('a malformed frame is ignored and the turn still completes', async () => {
  fake.turn = ({ emit, raw }) => {
    raw('{not json')
    raw('[]')
    raw('"just a string"')
    raw(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: {} }))
    raw(JSON.stringify({ jsonrpc: '2.0', id: 999_999, result: { stray: true } }))
    emit('message.delta', { text: 'still ' })
    emit('message.delta', { text: 'here' })
    emit('message.complete', { text: '', status: 'complete' })
  }
  const c = client()
  assert.equal((await c.ask(turn())).text, 'still here')
  assert.ok(logs.some((l) => l.includes('malformed frame ignored')))
})

test('a turn that never completes is «timeout», and Hermes is told to stop it', async () => {
  fake.turn = ({ emit }) => { emit('message.delta', { text: 'half' }) }
  const c = client(memorySessionStore(), { turnTimeoutMs: 150 })
  await assert.rejects(c.ask(turn()), kind('timeout'))
  await waitFor(() => fake.callsTo('session.interrupt').length === 1)
  assert.equal(c.busy, false)
  // And the session is not busy afterwards: the next turn streams normally.
  fake.turn = ({ emit }) => emit('message.complete', { text: 'again', status: 'complete' })
  assert.equal((await c.ask(turn())).text, 'again')
})

test('the client that went away gets its turn interrupted', async () => {
  fake.turn = ({ emit }) => { emit('message.delta', { text: 'half' }) }
  const c = client()
  const ac = new AbortController()
  const p = c.ask(turn(), ac.signal)
  await waitFor(() => fake.callsTo('prompt.submit').length === 1)
  ac.abort()
  await assert.rejects(p, kind('failed'))
  await waitFor(() => fake.callsTo('session.interrupt').length === 1)
  assert.equal(c.busy, false)
})

test('busy: a second question while one runs is refused, and prompt.submit is sent once', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  fake.turn = async ({ emit }) => {
    emit('message.delta', { text: 'a' })
    await gate
    emit('message.complete', { text: 'a', status: 'complete' })
  }
  const c = client()
  const first = c.ask(turn('перше'))
  await waitFor(() => fake.callsTo('prompt.submit').length === 1)
  assert.equal(c.busy, true)
  await assert.rejects(c.ask(turn('друге')), kind('busy'))
  release()
  assert.equal((await first).text, 'a')
  assert.equal(fake.callsTo('prompt.submit').length, 1)
  assert.equal(c.busy, false)
})

test('reconnect: after Hermes drops the socket the next turn resumes on a new socket', async () => {
  const store = memorySessionStore()
  const c = client(store)
  await c.ask(turn('перше'))
  fake.dropClients()
  await waitFor(() => logs.some((l) => l.includes('disconnected')))
  const reply = await c.ask(turn('друге'))
  assert.equal(reply.text, 'Маркер: VIOLET-624')
  assert.equal(fake.connections, 2)
  assert.deepEqual(fake.calls.map((x) => x.method), ['session.create', 'prompt.submit', 'session.resume', 'prompt.submit'])
  assert.equal(store.value, 'key-1')
})

test('restart: runtime ids change, the stored id still resumes', async () => {
  const c = client()
  await c.ask(turn('перше'))
  fake.restart()
  await waitFor(() => logs.some((l) => l.includes('disconnected')))
  await c.ask(turn('друге'))
  const submits = fake.callsTo('prompt.submit')
  assert.equal(submits[0]?.params.session_id, 'sid-1')
  assert.equal(submits[1]?.params.session_id, 'sid-2')
  assert.equal(fake.callsTo('session.create').length, 1)
})

test('a socket that dies mid-turn is «unavailable»; the next turn reconnects', async () => {
  fake.turn = ({ emit, dropSocket }) => { emit('message.delta', { text: 'half' }); dropSocket() }
  const c = client()
  await assert.rejects(c.ask(turn()), kind('unavailable'))
  fake.turn = ({ emit }) => emit('message.complete', { text: 'back', status: 'complete' })
  assert.equal((await c.ask(turn())).text, 'back')
  assert.equal(fake.connections, 2)
})

test('a stale runtime id (4001) costs one resume and one resubmit, not a new session', async () => {
  const store = memorySessionStore()
  const c = client(store)
  await c.ask(turn('перше'))
  fake.forgetRuntimes()
  fake.calls = []
  assert.equal((await c.ask(turn('друге'))).text, 'Маркер: VIOLET-624')
  assert.deepEqual(fake.calls.map((x) => x.method), ['prompt.submit', 'session.resume', 'prompt.submit'])
  assert.equal(fake.callsTo('session.create').length, 0)
  assert.equal(store.value, 'key-1')
})

test('a stored id Hermes no longer knows (4007) gets exactly one session.create; a second refusal does not loop', async () => {
  const store = memorySessionStore('ghost-key')
  const c = client(store)
  assert.equal((await c.ask(turn())).text, 'Маркер: VIOLET-624')
  assert.deepEqual(fake.calls.map((x) => x.method), ['session.resume', 'session.create', 'prompt.submit'])
  assert.equal(store.value, 'key-1')
  assert.ok(logs.some((l) => l.includes('code 4007')))

  const store2 = memorySessionStore('ghost-key-2')
  fake.createError = { code: 5000, message: 'db unavailable' }
  fake.calls = []
  await assert.rejects(client(store2).ask(turn()), kind('unavailable'))
  assert.deepEqual(fake.calls.map((x) => x.method), ['session.resume', 'session.create'])
  assert.equal(store2.value, null)
})

test('a new session is seeded with the phone\'s earlier turns; the prompt itself carries none of them', async () => {
  const history: CrowHistoryTurn[] = [
    { role: 'user', text: 'Привіт', ts: 1 },
    { role: 'agent', text: 'Привіт! Один чат.', ts: 2 },
    { role: 'user', text: 'Чому?', ts: 3 },
  ]
  const c = client()
  await c.ask(turn('Чому?', history))
  const create = fake.callsTo('session.create')[0]?.params
  assert.deepEqual(create?.messages, [{ role: 'user', content: 'Привіт' }, { role: 'assistant', content: 'Привіт! Один чат.' }])
  const prompt = String(fake.callsTo('prompt.submit')[0]?.params.text)
  assert.ok(prompt.endsWith('\n\nЧому?'))
  assert.ok(!prompt.includes('Один чат'))
  // The resumed session already holds the conversation: the second turn sends no history anywhere.
  await c.ask(turn('І далі?', [...history, { role: 'agent', text: 'Тому.', ts: 4 }, { role: 'user', text: 'І далі?', ts: 5 }]))
  assert.equal(fake.callsTo('session.create').length, 1)
  assert.ok(!String(fake.callsTo('prompt.submit')[1]?.params.text).includes('Тому.'))
})

test('a turn Hermes ends with status error is «failed»; so is an error event mid-turn', async () => {
  fake.turn = ({ emit }) => emit('message.complete', { text: '', status: 'error', error: 'provider down' })
  const c = client()
  await assert.rejects(c.ask(turn()), kind('failed'))
  fake.turn = ({ emit }) => emit('error', { message: 'Context injection refused.' })
  await assert.rejects(c.ask(turn()), kind('failed'))
  assert.equal(c.busy, false)
})

test('Hermes queueing the prompt into someone else\'s turn is «busy», and that turn is stopped', async () => {
  const c = client()
  await c.ask(turn('перше'))
  const session = [...fake.sessions.values()][0]
  if (session) session.running = true
  await assert.rejects(c.ask(turn('друге')), kind('busy'))
  assert.equal(fake.callsTo('session.interrupt').length, 1)
})

test('a question from the gateway (approval, clarify) is answered -32601 so the agent fails fast', async () => {
  fake.afterSubmit = JSON.stringify({ jsonrpc: '2.0', id: 'srq-7', method: 'approval', params: { command: 'rm -rf build' } })
  const c = client()
  await c.ask(turn())
  await waitFor(() => fake.clientResponses.length === 1)
  const answer = fake.clientResponses[0] as { id?: unknown; error?: { code?: number } }
  assert.equal(answer.id, 'srq-7')
  assert.equal(answer.error?.code, -32601)
})

test('the heartbeat pings while connected, and a silent socket is dropped and redialled', async () => {
  const c = client(memorySessionStore(), { heartbeatIntervalMs: 40, heartbeatDeadlineMs: 2_000 })
  await c.ask(turn())
  await waitFor(() => fake.callsTo('gateway.ping').length >= 2)

  const silent = client(memorySessionStore(), { heartbeatIntervalMs: 60, heartbeatDeadlineMs: 20 })
  await silent.ask(turn())
  await waitFor(() => logs.some((l) => l.includes('heartbeat deadline')))
  assert.equal((await silent.ask(turn())).text, 'Маркер: VIOLET-624')
})
