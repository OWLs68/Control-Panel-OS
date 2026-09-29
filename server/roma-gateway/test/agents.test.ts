/** The agents the phone shows: the registry read against the events and Hermes' answer. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SystemEvent } from '../../../src/data/types.ts'
import { shoppingFixture } from '../../../tests/fixtures/shopping-prices.ts'
import { AGENT_REGISTRY, deriveAgents, eventsForSnapshot, WORKING_WINDOW_MS } from '../src/agents.ts'
import { createHermesProbe, probeUrlFor } from '../src/hermes-probe.ts'
import { createStateBuilder } from '../src/state.ts'
import { mapFacts } from '../src/mapping.ts'
import { memoryEventStore, toSystemEvent } from '../src/events.ts'

const NOW = Date.parse('2026-09-29T12:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

let n = 0
function event(over: Partial<SystemEvent> = {}): SystemEvent {
  n++
  return {
    id: `e${n}`, user_id: null, created_at: 'x', updated_at: 'x', deleted_at: null, hlc: null,
    ts: NOW - 5 * MIN, kind: 'agent_result', title: `Подія ${n}`, detail: '', source: 'test', agentId: null, ...over,
  }
}

function status(events: SystemEvent[], id: string, hermesAlive: boolean | null = null, now = NOW) {
  return deriveAgents(AGENT_REGISTRY, events, hermesAlive, now).find((a) => a.id === id)!
}

test('the registry: who exists, without a secret', () => {
  assert.deepEqual(AGENT_REGISTRY.map((a) => a.id), ['crow', 'shopping-scout', 'mac-worker'])
  assert.equal(JSON.stringify(AGENT_REGISTRY).toLowerCase().includes('token'), false)
})

test('an agent nobody has heard from is «немає даних», never offline', () => {
  const a = status([], 'mac-worker')
  assert.equal(a.status, 'unknown')
  assert.equal(a.lastActivity, null)
  assert.equal(status([event({ agentId: 'someone-else' })], 'mac-worker').status, 'unknown')
})

test('online only while a started event is under 15 minutes old', () => {
  assert.equal(status([event({ agentId: 'mac-worker', kind: 'agent_started', ts: NOW - 14 * MIN })], 'mac-worker').status, 'online')
  assert.equal(status([event({ agentId: 'mac-worker', kind: 'agent_started', ts: NOW - WORKING_WINDOW_MS })], 'mac-worker').status, 'idle')
  // A fresh RESULT is a finished run: waiting, not working.
  assert.equal(status([event({ agentId: 'mac-worker', kind: 'agent_result', ts: NOW - 2 * MIN })], 'mac-worker').status, 'idle')
})

test('idle inside the quiet window, offline past it — 26 h for the daily scout, 24 h for the rest', () => {
  const at = (id: string, ageH: number) => status([event({ agentId: id, ts: NOW - ageH * HOUR })], id).status
  assert.equal(at('shopping-scout', 25), 'idle')
  assert.equal(at('shopping-scout', 27), 'offline')
  assert.equal(at('mac-worker', 23), 'idle')
  assert.equal(at('mac-worker', 25), 'offline')
})

test('the newest event wins, whatever order they come in; lastActivity is its time and title', () => {
  const old = event({ agentId: 'shopping-scout', ts: NOW - 5 * HOUR, title: 'Вчорашній скан' })
  const fresh = event({ agentId: 'shopping-scout', ts: NOW - 1 * HOUR, title: 'Сьогоднішній скан' })
  for (const list of [[old, fresh], [fresh, old]]) {
    const a = status(list, 'shopping-scout')
    assert.deepEqual(a.lastActivity, { ts: fresh.ts, title: 'Сьогоднішній скан' })
    assert.equal(a.status, 'idle')
  }
})

test('Crow follows Hermes, not the event feed: answers → online, silent → offline, no probe → unknown', () => {
  assert.equal(status([], 'crow', true).status, 'online')
  assert.equal(status([], 'crow', false).status, 'offline')
  assert.equal(status([], 'crow', null).status, 'unknown')
  // Events for Crow still give his last activity, but not his status.
  const a = status([event({ agentId: 'crow', ts: NOW - 40 * HOUR, title: 'Відповів у чаті' })], 'crow', true)
  assert.equal(a.status, 'online')
  assert.equal(a.lastActivity?.title, 'Відповів у чаті')
})

test('an agent has no task in the live word: the demo\'s «task» is not invented', () => {
  assert.equal(status([event({ agentId: 'shopping-scout' })], 'shopping-scout').task, null)
})

test('the snapshot keeps each agent\'s newest event with a payload, even past the newest N', () => {
  const priced = { ...event({ agentId: 'shopping-scout', ts: NOW - 30 * HOUR, title: 'Скан' }), data: shoppingFixture() as never }
  const chatter = Array.from({ length: 60 }, (_, i) => event({ agentId: 'crow', ts: NOW - i * MIN }))
  const out = eventsForSnapshot([...chatter, priced], AGENT_REGISTRY, 50)
  assert.equal(out.length, 51)
  assert.ok(out.includes(priced))
  // Nothing doubled when it is already among the newest.
  assert.equal(eventsForSnapshot([priced], AGENT_REGISTRY, 50).length, 1)
})

test('the state carries agents read from the WHOLE store, and asks Hermes once per build', async () => {
  const store = memoryEventStore()
  await store.append(toSystemEvent({
    id: 'scout:1', kind: 'agent_result', title: 'Скан', detail: '', source: 'shopping-scout', agentId: 'shopping-scout',
    taskId: null, projectId: null, severity: 'info', needsRoman: false, ts: NOW - HOUR, data: null,
  }, NOW))
  let probes = 0
  const build = createStateBuilder(
    { recentFacts: async () => [] }, mapFacts, 50, () => NOW,
    { reader: store, limit: 50, all: 500 },
    { registry: AGENT_REGISTRY, hermesAlive: async () => { probes++; return true } },
  )
  const snap = await build()
  assert.deepEqual(snap.agents?.map((a) => [a.id, a.status]), [['crow', 'online'], ['shopping-scout', 'idle'], ['mac-worker', 'unknown']])
  assert.equal(snap.events?.length, 1)
  assert.equal(probes, 1)
})

test('without an Event Center the agents are still there: Crow by Hermes, the rest «немає даних»', async () => {
  const build = createStateBuilder({ recentFacts: async () => [] }, mapFacts, 50, () => NOW, null,
    { registry: AGENT_REGISTRY, hermesAlive: null })
  const snap = await build()
  assert.equal('events' in snap, false)
  assert.deepEqual(snap.agents?.map((a) => a.status), ['unknown', 'unknown', 'unknown'])
})

test('the probe asks the address Hermes listens on, not its path or token', () => {
  assert.equal(probeUrlFor('ws://127.0.0.1:9119/api/ws?token=SECRET'), 'http://127.0.0.1:9119/')
  assert.equal(probeUrlFor('wss://hermes.test/api/ws'), 'https://hermes.test/')
  assert.equal(probeUrlFor('http://x'), null)
  assert.equal(probeUrlFor('nonsense'), null)
})

test('any HTTP answer is «alive», a refusal or a silence is not; the verdict is kept for a while', async () => {
  let calls = 0
  let mode: 'ok' | 'notfound' | 'down' = 'ok'
  let clock = 1_000_000
  const fake = (async (url: string | URL | Request) => {
    calls++
    assert.equal(String(url), 'http://127.0.0.1:9119/')
    if (mode === 'down') throw new TypeError('fetch failed')
    return new Response('', { status: mode === 'ok' ? 200 : 404 })
  }) as typeof fetch
  const probe = createHermesProbe('ws://127.0.0.1:9119/api/ws', fake, () => clock)
  assert.ok(probe)
  assert.equal(await probe(), true)
  assert.equal(await probe(), true)
  assert.equal(calls, 1)
  clock += 11_000
  mode = 'notfound'
  assert.equal(await probe(), true)     // a 404 is still a process that answers
  clock += 11_000
  mode = 'down'
  assert.equal(await probe(), false)
  assert.equal(calls, 3)
})
