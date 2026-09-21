/** Crow's live transport: what leaves the phone, what it accepts back, and how each failure is named. */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { askCrow, createLiveGateway, getGateway, parseCrowReply, postCrow, setGateway } from '../../src/hermes/gateway.js'
import { stubGateway } from '../../src/hermes/stub.js'
import { GatewayError, type CrowRequest } from '../../src/hermes/contract.js'

const REQUEST: CrowRequest = {
  text: 'А чого це заблоковано?',
  context: {
    activeModule: 'projects', activeScreen: 'detail', activeEntity: 'blocker', selectedItem: 'b-1', projectId: 'p-1',
    agentId: null, filters: {}, visibleState: ['NeverMind 60%'], blockers: [], selection: 'Окремі ключі',
  },
  history: [{ role: 'user', text: 'Привіт', ts: 1 }],
  requestId: 'req-1',
}
const REPLY = { requestId: 'req-1', text: 'Маркер: VIOLET-624', chips: [], priority: 'normal' }
const GW = 'https://mac.tailnet.ts.net'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; setGateway(stubGateway) })

function answer(status: number, body: string | object): void {
  globalThis.fetch = (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })) as typeof fetch
}

async function kindOf(url = GW): Promise<string> {
  try { await postCrow(url, REQUEST); return 'ok' } catch (err) { return err instanceof GatewayError ? err.kind : 'other' }
}

test('the request goes to POST /api/v1/crow as JSON, whole, on the cleaned address', async () => {
  let seen: { url: string; init: RequestInit | undefined } | null = null
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen = { url: String(input), init }
    return new Response(JSON.stringify(REPLY), { status: 200 })
  }) as typeof fetch
  const reply = await postCrow(`${GW}/`, REQUEST)
  assert.deepEqual(reply, REPLY)
  assert.ok(seen)
  const s = seen as unknown as { url: string; init: RequestInit }
  assert.equal(s.url, `${GW}/api/v1/crow`)
  assert.equal(s.init.method, 'POST')
  assert.deepEqual(JSON.parse(String(s.init.body)), REQUEST)
  assert.equal((s.init.headers as Record<string, string>)['Content-Type'], 'application/json')
})

test('every failure has its name', async () => {
  assert.equal(await kindOf(''), 'not-configured')
  assert.equal(await kindOf('http://mac.tailnet.ts.net'), 'not-configured')
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
  assert.equal(await kindOf(), 'unreachable')
  answer(401, { error: 'forbidden' }); assert.equal(await kindOf(), 'unauthorized')
  answer(403, { error: 'forbidden' }); assert.equal(await kindOf(), 'unauthorized')
  answer(409, { error: 'busy' }); assert.equal(await kindOf(), 'rate-limited')
  answer(429, {}); assert.equal(await kindOf(), 'rate-limited')
  answer(400, { error: 'bad_request' }); assert.equal(await kindOf(), 'bad-response')
  answer(413, { error: 'too_large' }); assert.equal(await kindOf(), 'bad-response')
  answer(501, { error: 'not_implemented' }); assert.equal(await kindOf(), 'unreachable')
  answer(502, { error: 'hermes_unavailable' }); assert.equal(await kindOf(), 'unreachable')
  answer(504, { error: 'hermes_timeout' }); assert.equal(await kindOf(), 'unreachable')
  answer(200, '<html>not json'); assert.equal(await kindOf(), 'bad-response')
  answer(200, { ...REPLY, requestId: 'someone-else' }); assert.equal(await kindOf(), 'bad-response')
  answer(200, { ...REPLY, priority: 'loud' }); assert.equal(await kindOf(), 'bad-response')
  answer(200, REPLY); assert.equal(await kindOf(), 'ok')
})

test('only a CrowReply is a reply', () => {
  assert.deepEqual(parseCrowReply(REPLY), REPLY)
  assert.deepEqual(parseCrowReply({ ...REPLY, forModule: 'projects' }), { ...REPLY, forModule: 'projects' })
  const chip = { id: 'c1', label: 'Покажи проєкт', action: 'nav', target: 'projects', tone: 'accent' }
  assert.deepEqual(parseCrowReply({ ...REPLY, chips: [chip] })?.chips, [chip])
  assert.equal(parseCrowReply({ ...REPLY, text: '' })?.text, '')
  assert.equal(parseCrowReply(null), null)
  assert.equal(parseCrowReply('text'), null)
  assert.equal(parseCrowReply({ ...REPLY, requestId: '' }), null)
  assert.equal(parseCrowReply({ ...REPLY, text: 42 }), null)
  assert.equal(parseCrowReply({ ...REPLY, chips: 'none' }), null)
  assert.equal(parseCrowReply({ ...REPLY, chips: [{ id: 'c', label: 'x', action: 'fly' }] }), null)
  assert.equal(parseCrowReply({ ...REPLY, chips: [{ id: 'c', label: 'x', action: 'nav', tone: 'loud' }] }), null)
  assert.equal(parseCrowReply({ ...REPLY, forModule: 7 }), null)
})

test('the live gateway asks through askCrow: the address is read at ask time, the boundary keeps safeReply', async () => {
  let url = ''
  const live = createLiveGateway(() => url)
  assert.equal(live.mode, 'live')
  setGateway(live)
  assert.equal(getGateway().mode, 'live')
  await assert.rejects(askCrow(REQUEST), (e: unknown) => e instanceof GatewayError && e.kind === 'not-configured')
  url = GW
  answer(200, { ...REPLY, text: '{"tool":"save"}' })
  const reply = await askCrow(REQUEST)
  assert.equal(reply.text, 'Зроблено ✓')   // a raw JSON body never reaches the user, live or stub
  answer(200, { ...REPLY, text: '' })
  assert.equal((await askCrow(REQUEST)).text, 'Готово.')
  setGateway(stubGateway)
  assert.equal(getGateway().mode, 'stub')
})
