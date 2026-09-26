/**
 * «Потребує мене» on Control, live: one filter over the events the feed
 * already carries — no second read, no second source of truth.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mockAdapter, needsRomanEvents, type DataAdapter } from '../../src/data/adapters.js'
import { sourced, type SystemEvent } from '../../src/data/types.js'

const at = '2026-09-26T21:00:00.000Z'
const event = (id: string, over: Partial<SystemEvent> = {}): SystemEvent => ({
  id, user_id: null, created_at: at, updated_at: at, deleted_at: null, hlc: null,
  ts: Date.parse(at), kind: 'agent_result', title: `Подія ${id}`, detail: '', source: 'curl',
  agentId: null, taskId: null, projectId: null, severity: 'info', needsRoman: false, ...over,
})

/** A live adapter as far as this filter is concerned: the feed, newest first, as the real one sorts it. */
function liveWith(events: SystemEvent[]): DataAdapter {
  return {
    ...mockAdapter,
    origin: 'live',
    events: (limit = 50) => ({
      value: [...events].sort((a, b) => b.ts - a.ts).slice(0, limit),
      origin: 'live', source: 'gateway:events', fetchedAt: Date.parse(at),
    }),
  }
}

test('live: only the events flagged for Roman, and the source stays the feed’s', () => {
  const waiting = needsRomanEvents(liveWith([
    event('a', { needsRoman: true, title: 'Чекає на мене' }),
    event('b', { needsRoman: false, title: 'Не чекає' }),
  ]))
  assert.ok(waiting)
  assert.equal(waiting.value.length, 1)
  assert.deepEqual(waiting.value.map((e) => e.title), ['Чекає на мене'])
  assert.equal(waiting.origin, 'live')
  assert.equal(waiting.source, 'gateway:events')
})

test('live: newest first, the same order «Події» shows', () => {
  const older = event('older', { needsRoman: true, ts: Date.parse(at) - 60_000 })
  const newer = event('newer', { needsRoman: true, ts: Date.parse(at) })
  const waiting = needsRomanEvents(liveWith([older, newer]))
  assert.deepEqual(waiting?.value.map((e) => e.id), ['newer', 'older'])
})

test('live events with nothing flagged: a live reading of zero, not «no data»', () => {
  const waiting = needsRomanEvents(liveWith([event('a'), event('b')]))
  assert.ok(waiting)
  assert.equal(waiting.value.length, 0)
  assert.equal(waiting.origin, 'live')
})

test('an empty live feed is still live, and still zero', () => {
  const waiting = needsRomanEvents(liveWith([]))
  assert.ok(waiting)
  assert.equal(waiting.value.length, 0)
})

test('a missing flag is not a flag: undefined never counts as waiting', () => {
  const bare: SystemEvent = { ...event('bare'), needsRoman: undefined }
  assert.equal(needsRomanEvents(liveWith([bare]))?.value.length, 0)
})

test('demo mode is untouched: no live feed, so Control keeps its own block', () => {
  assert.equal(needsRomanEvents(mockAdapter), null)
  // Live app, Event Center off: the feed is the demo one, so still null.
  const centerOff: DataAdapter = { ...mockAdapter, origin: 'live', events: (limit = 50) => sourced(
    [event('demo', { needsRoman: true })].slice(0, limit), 'mock', 'fixtures:events') }
  assert.equal(needsRomanEvents(centerOff), null)
})
