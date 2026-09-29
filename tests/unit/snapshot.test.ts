/** The one door out: what the phone accepts as a live snapshot, and how each failure is named. */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fetchSnapshot, normalizeGatewayUrl, parseSnapshot } from '../../src/hermes/gateway.js'
import { GatewayError } from '../../src/hermes/contract.js'
import { shoppingFixture } from '../fixtures/shopping-prices.js'

const FACT = {
  id: '78', user_id: null, created_at: '2026-09-20T22:53:19.774Z', updated_at: '2026-09-20T22:53:19.774Z',
  deleted_at: null, hlc: null, text: 'Правило про джерела правди.', category: 'preference',
  ts: Date.parse('2026-09-20T22:53:17.918Z'),
}
const SNAPSHOT = { memory: [FACT], fetchedAt: 1_700_000_000_000, source: 'gbrain:recall' }

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

function answer(status: number, body: string | object, ok = true): void {
  globalThis.fetch = (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })) as typeof fetch
  void ok
}

async function kindOf(url = 'https://mac.tailnet.ts.net'): Promise<string> {
  try { await fetchSnapshot(url); return 'ok' } catch (err) { return err instanceof GatewayError ? err.kind : 'other' }
}

test('only https (or loopback http) without credentials, cleaned of query and slashes', () => {
  assert.equal(normalizeGatewayUrl(' https://mac.tailnet.ts.net/ '), 'https://mac.tailnet.ts.net')
  assert.equal(normalizeGatewayUrl('https://mac.tailnet.ts.net/?x=1#y'), 'https://mac.tailnet.ts.net')
  assert.equal(normalizeGatewayUrl('http://127.0.0.1:8787'), 'http://127.0.0.1:8787')
  assert.equal(normalizeGatewayUrl('http://mac.tailnet.ts.net'), null)
  assert.equal(normalizeGatewayUrl('https://user:pw@mac.ts.net'), null)
  assert.equal(normalizeGatewayUrl('mac.ts.net'), null)
  assert.equal(normalizeGatewayUrl(''), null)
})

test('every failure has its name', async () => {
  assert.equal(await kindOf(''), 'not-configured')
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
  assert.equal(await kindOf(), 'unreachable')
  answer(401, { error: 'forbidden' }); assert.equal(await kindOf(), 'unauthorized')
  answer(403, { error: 'forbidden' }); assert.equal(await kindOf(), 'unauthorized')
  answer(429, {}); assert.equal(await kindOf(), 'rate-limited')
  answer(502, { error: 'gbrain_unavailable' }); assert.equal(await kindOf(), 'unreachable')
  answer(200, '<html>not json'); assert.equal(await kindOf(), 'bad-response')
  answer(200, { memory: 'nope' }); assert.equal(await kindOf(), 'bad-response')
  answer(200, SNAPSHOT); assert.equal(await kindOf(), 'ok')
})

test('a good snapshot comes back as it is; a bad row poisons the whole snapshot', async () => {
  answer(200, SNAPSHOT)
  const snap = await fetchSnapshot('https://mac.tailnet.ts.net')
  assert.deepEqual(snap, SNAPSHOT)
  assert.equal(parseSnapshot({ ...SNAPSHOT, memory: [FACT, { ...FACT, category: 'weird' }] }), null)
  assert.equal(parseSnapshot({ ...SNAPSHOT, memory: [{ ...FACT, id: '' }] }), null)
  assert.equal(parseSnapshot({ ...SNAPSHOT, fetchedAt: 'yesterday' }), null)
  assert.equal(parseSnapshot({ ...SNAPSHOT, source: '' }), null)
  assert.deepEqual(parseSnapshot({ memory: [], fetchedAt: 1, source: 'gbrain:recall' }), { memory: [], fetchedAt: 1, source: 'gbrain:recall' })
})

test('the state path is appended to the cleaned address', async () => {
  let called = ''
  globalThis.fetch = (async (input: RequestInfo | URL) => { called = String(input); return new Response(JSON.stringify(SNAPSHOT), { status: 200 }) }) as typeof fetch
  await fetchSnapshot('https://mac.tailnet.ts.net/')
  assert.equal(called, 'https://mac.tailnet.ts.net/api/v1/state')
})

const EVENT = {
  id: 'curl:test:1', user_id: null, created_at: '2026-09-26T10:00:00.000Z', updated_at: '2026-09-26T10:00:00.000Z',
  deleted_at: null, hlc: null, ts: Date.parse('2026-09-26T10:00:00.000Z'), kind: 'alert', title: 'Тест з Mac',
  detail: '', source: 'curl', agentId: null, taskId: null, projectId: null, severity: 'info', needsRoman: true,
}

test('events ride along when the Event Center is on; without the key the snapshot has none', () => {
  const withEvents = parseSnapshot({ ...SNAPSHOT, events: [EVENT] })
  assert.deepEqual(withEvents?.events, [EVENT])
  assert.equal('events' in (parseSnapshot(SNAPSHOT) ?? {}), false)
  assert.deepEqual(parseSnapshot({ ...SNAPSHOT, events: [] })?.events, [])
})

test('an event the phone cannot render is left out; it never takes memory down with it', () => {
  const snap = parseSnapshot({
    ...SNAPSHOT,
    events: [EVENT, { ...EVENT, id: 'x', kind: 'teleport' }, { ...EVENT, id: 'y', needsRoman: 'yes' }, { ...EVENT, id: 'z', title: '' }, 'junk'],
  })
  assert.ok(snap)
  assert.deepEqual(snap.memory, [FACT])
  assert.deepEqual(snap.events?.map((e) => e.id), ['curl:test:1'])
  // The demo feed's shape (no agent fields) is still an event.
  const demo = { id: 'd', user_id: null, created_at: 'x', updated_at: 'x', deleted_at: null, hlc: null, ts: 1, kind: 'note', title: 'Запис', detail: '', source: 'Crow' }
  assert.equal(parseSnapshot({ ...SNAPSHOT, events: [demo] })?.events?.length, 1)
  // Not a list at all is not a snapshot.
  assert.equal(parseSnapshot({ ...SNAPSHOT, events: 'nope' }), null)
})

const AGENT = {
  id: 'shopping-scout', user_id: null, created_at: '2026-09-29T10:00:00.000Z', updated_at: '2026-09-29T10:00:00.000Z',
  deleted_at: null, hlc: null, name: 'Shopping Scout', role: 'Пошук знижок', model: 'сервіс на Mac', status: 'idle', risk: 'L0',
  task: null, lastActivity: { ts: 1_790_000_000_000, title: 'Скан 07:00' },
}

test('agents ride along; «unknown» is a status; without the key the snapshot has none', () => {
  const snap = parseSnapshot({ ...SNAPSHOT, agents: [AGENT, { ...AGENT, id: 'mac-worker', status: 'unknown', lastActivity: null }] })
  assert.deepEqual(snap?.agents?.map((a) => [a.id, a.status]), [['shopping-scout', 'idle'], ['mac-worker', 'unknown']])
  assert.equal('agents' in (parseSnapshot(SNAPSHOT) ?? {}), false)
})

test('an agent the phone cannot read is left out; a key that is not a list is ignored, not an error', () => {
  const snap = parseSnapshot({
    ...SNAPSHOT,
    agents: [AGENT, { ...AGENT, id: 'a', status: 'sleeping' }, { ...AGENT, id: 'b', risk: 'L9' }, { ...AGENT, id: 'c', name: '' }, { ...AGENT, id: 'd', lastActivity: { ts: 'now', title: 'x' } }, 'junk'],
  })
  assert.deepEqual(snap?.agents?.map((a) => a.id), ['shopping-scout'])
  const ignored = parseSnapshot({ ...SNAPSHOT, agents: 'nope' })
  assert.ok(ignored)
  assert.equal('agents' in ignored, false)
  assert.deepEqual(ignored.memory, [FACT])
})

test('an event carries its price payload only if it passes; a bad payload leaves the event as text', () => {
  const good = { ...EVENT, id: 'p1', kind: 'agent_result', agentId: 'shopping-scout', data: shoppingFixture() }
  const badPrice = shoppingFixture()
  badPrice.products[0]!.prices[0]!.price = -1
  const bad = { ...EVENT, id: 'p2', data: badPrice }
  const junk = { ...EVENT, id: 'p3', data: 'not an object' }
  const snap = parseSnapshot({ ...SNAPSHOT, events: [good, bad, junk] })
  assert.deepEqual(snap?.events?.map((e) => e.id), ['p1', 'p2', 'p3'])
  assert.equal(snap?.events?.[0]?.data?.products.length, 3)
  assert.equal('data' in (snap?.events?.[1] ?? {}), false)
  assert.equal('data' in (snap?.events?.[2] ?? {}), false)
})

test('a cache written before agents and payloads existed still reads: exactly as it was, no agents', () => {
  const old = { memory: [FACT], fetchedAt: 1_700_000_000_000, source: 'gbrain:recall', events: [EVENT] }
  const snap = parseSnapshot(JSON.parse(JSON.stringify(old)))
  assert.deepEqual(snap, old)
  assert.equal('agents' in (snap ?? {}), false)
})

test('a cache that cannot be read at all is nothing, not a crash', () => {
  for (const junk of [null, 'x', 42, [], {}, { memory: 'x' }, { memory: [], fetchedAt: 'never', source: 'gbrain:recall' }]) {
    assert.equal(parseSnapshot(junk), null)
  }
})
