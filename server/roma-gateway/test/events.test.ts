import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  bearerFrom, EVENT_LIMITS, fileEventStore, memoryEventStore, parseEventInput, tokenMatches, toSystemEvent,
  type EventInput,
} from '../src/events.ts'

const NOW = Date.parse('2026-09-26T12:00:00Z')

function input(over: Partial<EventInput> = {}): EventInput {
  return {
    id: null, kind: 'agent_result', title: 'Готово', detail: '', source: 'curl',
    agentId: null, taskId: null, projectId: null, severity: 'info', needsRoman: false, ts: null, ...over,
  }
}

function parse(body: unknown) {
  return parseEventInput(typeof body === 'string' ? body : JSON.stringify(body), NOW)
}

test('the smallest event is a kind, a title and a source; the rest has defaults', () => {
  const r = parse({ kind: 'alert', title: 'Лосось −40%', source: 'curl' })
  assert.ok(r.ok)
  assert.deepEqual(r.input, {
    id: null, kind: 'alert', title: 'Лосось −40%', detail: '', source: 'curl',
    agentId: null, taskId: null, projectId: null, severity: 'info', needsRoman: false, ts: null,
  })
})

test('every agent kind is accepted; the demo kinds and anything else are not', () => {
  for (const kind of ['agent_started', 'agent_result', 'agent_finished', 'agent_blocked', 'alert']) {
    assert.ok(parse({ kind, title: 't', source: 's' }).ok, kind)
  }
  for (const kind of ['note', 'deploy', 'needs_roman', '', 3]) {
    assert.deepEqual(parse({ kind, title: 't', source: 's' }), { ok: false, error: 'invalid_event', field: 'kind' })
  }
})

test('needsRoman is a flag on any kind, and it has to be a boolean', () => {
  const r = parse({ kind: 'agent_blocked', title: 'Чекаю рішення', source: 'scout', needsRoman: true, severity: 'warning' })
  assert.ok(r.ok)
  assert.equal(r.input.needsRoman, true)
  assert.equal(r.input.severity, 'warning')
  assert.deepEqual(parse({ kind: 'alert', title: 't', source: 's', needsRoman: 'yes' }), { ok: false, error: 'invalid_event', field: 'needsRoman' })
  assert.deepEqual(parse({ kind: 'alert', title: 't', source: 's', severity: 'urgent' }), { ok: false, error: 'invalid_event', field: 'severity' })
})

test('not JSON, or not an object, is a bad request; a missing title or source names the field', () => {
  assert.deepEqual(parse('{nope'), { ok: false, error: 'bad_request' })
  assert.deepEqual(parse([1, 2]), { ok: false, error: 'bad_request' })
  assert.deepEqual(parse({ kind: 'alert', title: '   ', source: 's' }), { ok: false, error: 'invalid_event', field: 'title' })
  assert.deepEqual(parse({ kind: 'alert', title: 't' }), { ok: false, error: 'invalid_event', field: 'source' })
  assert.deepEqual(parse({ kind: 'alert', title: 't', source: 's', detail: 42 }), { ok: false, error: 'invalid_event', field: 'detail' })
  assert.deepEqual(parse({ kind: 'alert', title: 't', source: 's', agentId: 7 }), { ok: false, error: 'invalid_event', field: 'agentId' })
})

test('a producer id is a safe key; anything else is refused', () => {
  const ok = parse({ id: 'shopping-scout:deal:42', kind: 'alert', title: 't', source: 's' })
  assert.ok(ok.ok)
  assert.equal(ok.input.id, 'shopping-scout:deal:42')
  for (const id of ['with space', 'a/b', '', 'x'.repeat(EVENT_LIMITS.id + 1), 12]) {
    assert.deepEqual(parse({ id, kind: 'alert', title: 't', source: 's' }), { ok: false, error: 'invalid_event', field: 'id' })
  }
})

test('long text is cut to size and flattened to one line where it is a name', () => {
  const r = parse({ kind: 'alert', title: `a\n\n${'b'.repeat(500)}`, source: 's'.repeat(200), detail: 'd'.repeat(5000), agentId: '  scout  ' })
  assert.ok(r.ok)
  assert.equal(r.input.title.length, EVENT_LIMITS.title)
  assert.ok(r.input.title.startsWith('a b'))
  assert.equal(r.input.source.length, EVENT_LIMITS.source)
  assert.equal(r.input.detail.length, EVENT_LIMITS.detail)
  assert.equal(r.input.agentId, 'scout')
})

test('the event time is ms or ISO with an offset; far in the future is refused', () => {
  const iso = parse({ kind: 'alert', title: 't', source: 's', ts: '2026-09-26T14:00:00+02:00' })
  assert.ok(iso.ok)
  assert.equal(iso.input.ts, NOW)
  const ms = parse({ kind: 'alert', title: 't', source: 's', ts: NOW - 1000 })
  assert.ok(ms.ok)
  assert.equal(ms.input.ts, NOW - 1000)
  assert.ok(parse({ kind: 'alert', title: 't', source: 's', ts: NOW + 60_000 }).ok)   // a clock a minute ahead is fine
  assert.deepEqual(parse({ kind: 'alert', title: 't', source: 's', ts: NOW + 3_600_000 }), { ok: false, error: 'invalid_event', field: 'ts' })
  assert.deepEqual(parse({ kind: 'alert', title: 't', source: 's', ts: 'yesterday' }), { ok: false, error: 'invalid_event', field: 'ts' })
})

test('the Event Center stamps the envelope: received time, the event time, every field set', () => {
  const ev = toSystemEvent(input({ ts: NOW - 5000, needsRoman: true }), NOW, () => 'gen-1')
  assert.deepEqual(ev, {
    id: 'gen-1', user_id: null, created_at: '2026-09-26T12:00:00.000Z', updated_at: '2026-09-26T12:00:00.000Z',
    deleted_at: null, hlc: null, ts: NOW - 5000, kind: 'agent_result', title: 'Готово', detail: '', source: 'curl',
    agentId: null, taskId: null, projectId: null, severity: 'info', needsRoman: true,
  })
  assert.equal(toSystemEvent(input({ id: 'mine' }), NOW).id, 'mine')
  assert.equal(toSystemEvent(input(), NOW).ts, NOW)
})

test('the file store survives a restart, owner-only; a known id is not written twice', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roma-events-'))
  try {
    const path = join(dir, 'nested', 'events.json')
    const store = fileEventStore(path)
    assert.deepEqual(await store.list(10), [])
    const first = await store.append(toSystemEvent(input({ id: 'a', ts: NOW - 2000 }), NOW))
    assert.equal(first.duplicate, false)
    await store.append(toSystemEvent(input({ id: 'b', ts: NOW - 1000, title: 'Друге' }), NOW))
    const again = await store.append(toSystemEvent(input({ id: 'a', title: 'Інше' }), NOW + 1))
    assert.equal(again.duplicate, true)
    assert.equal(again.event.title, 'Готово')   // the stored one, unchanged

    const reopened = fileEventStore(path)
    assert.deepEqual((await reopened.list(10)).map((e) => e.id), ['b', 'a'])   // newest first
    if (process.platform !== 'win32') {
      assert.equal((await stat(path)).mode & 0o777, 0o600)
      assert.equal((await stat(join(dir, 'nested'))).mode & 0o077, 0)
    }
    const raw = JSON.parse(await readFile(path, 'utf8')) as { version: number; events: unknown[] }
    assert.equal(raw.version, 1)
    assert.equal(raw.events.length, 2)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the store keeps the newest arrivals only, and two writes at once both land', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roma-events-'))
  try {
    const path = join(dir, 'events.json')
    const store = fileEventStore(path, 3)
    await Promise.all(['1', '2', '3', '4', '5'].map((id, i) => store.append(toSystemEvent(input({ id, ts: NOW + i }), NOW + i))))
    assert.deepEqual((await fileEventStore(path, 3).list(10)).map((e) => e.id), ['5', '4', '3'])
    assert.deepEqual((await store.list(2)).map((e) => e.id), ['5', '4'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a corrupt file is moved aside, never overwritten, and the feed starts empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roma-events-'))
  const logs: string[] = []
  try {
    const path = join(dir, 'events.json')
    await writeFile(path, '{broken')
    const store = fileEventStore(path, 10, (l) => logs.push(l))
    assert.deepEqual(await store.list(10), [])
    await store.append(toSystemEvent(input({ id: 'fresh' }), NOW))
    const names = await readdir(dir)
    assert.ok(names.some((n) => n.startsWith('events.json.corrupt-')))
    const aside = names.find((n) => n.startsWith('events.json.corrupt-')) ?? ''
    assert.equal(await readFile(join(dir, aside), 'utf8'), '{broken')
    assert.equal(logs.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('rows that would not render are skipped on read, with a log line', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roma-events-'))
  const logs: string[] = []
  try {
    const path = join(dir, 'events.json')
    const good = toSystemEvent(input({ id: 'ok' }), NOW)
    await writeFile(path, JSON.stringify({ version: 1, events: [good, { id: 'bad', kind: 'nope' }] }))
    assert.deepEqual((await fileEventStore(path, 10, (l) => logs.push(l)).list(10)).map((e) => e.id), ['ok'])
    assert.equal(logs.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the memory store keeps the same contract', async () => {
  const store = memoryEventStore(2)
  await store.append(toSystemEvent(input({ id: 'x', ts: 1 }), NOW))
  assert.equal((await store.append(toSystemEvent(input({ id: 'x' }), NOW))).duplicate, true)
  await store.append(toSystemEvent(input({ id: 'y', ts: 2 }), NOW))
  await store.append(toSystemEvent(input({ id: 'z', ts: 3 }), NOW))
  assert.deepEqual((await store.list(10)).map((e) => e.id), ['z', 'y'])
})

test('the producer token: a Bearer header, compared whole', () => {
  assert.equal(bearerFrom({ authorization: 'Bearer abc123' }), 'abc123')
  assert.equal(bearerFrom({ authorization: 'bearer abc123 ' }), 'abc123')
  assert.equal(bearerFrom({ authorization: 'Basic abc' }), null)
  assert.equal(bearerFrom({}), null)
  assert.equal(tokenMatches('abc123', 'abc123'), true)
  assert.equal(tokenMatches('abc12', 'abc123'), false)
  assert.equal(tokenMatches(null, 'abc123'), false)
  assert.equal(tokenMatches('', ''), false)
})
