/** The one door out: what the phone accepts as a live snapshot, and how each failure is named. */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fetchSnapshot, normalizeGatewayUrl, parseSnapshot } from '../../src/hermes/gateway.js'
import { GatewayError } from '../../src/hermes/contract.js'

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
