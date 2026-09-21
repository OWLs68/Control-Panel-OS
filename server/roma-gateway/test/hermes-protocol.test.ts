import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CONTEXT_CLOSE, CONTEXT_NOTE, CONTEXT_OPEN, buildPrompt, errorResponseFrame, finalText, parseFrame, requestFrame, seedMessages, turnStatus,
  type CrowContext,
} from '../src/hermes-protocol.ts'

const CONTEXT: CrowContext = {
  activeModule: 'projects', activeScreen: 'detail', activeEntity: 'blocker', selectedItem: 'b-12',
  projectId: 'p-1', agentId: null, filters: { status: 'open' }, visibleState: ['NeverMind 60%', 'два блокери'],
  blockers: ['Окремі ключі для клієнтів (critical)'], selection: 'Окремі ключі для клієнтів',
}

test('frames: an event, a response, an error, a server request — and nothing else', () => {
  const ev = parseFrame('{"jsonrpc":"2.0","method":"event","params":{"type":"message.delta","session_id":"s1","seq":4,"payload":{"text":"hi"}}}')
  assert.deepEqual(ev, { kind: 'event', type: 'message.delta', sessionId: 's1', payload: { text: 'hi' } })
  const ready = parseFrame('{"jsonrpc":"2.0","method":"event","params":{"type":"gateway.ready","payload":{"heartbeat":true}}}')
  assert.equal(ready?.kind, 'event')
  assert.equal((ready as { sessionId: string | null }).sessionId, null)

  const ok = parseFrame('{"jsonrpc":"2.0","id":7,"result":{"status":"streaming"}}')
  assert.deepEqual(ok, { kind: 'response', id: 7, result: { status: 'streaming' }, error: null })
  const bad = parseFrame('{"jsonrpc":"2.0","id":8,"error":{"code":4007,"message":"session not found"}}')
  assert.deepEqual(bad, { kind: 'response', id: 8, result: undefined, error: { code: 4007, message: 'session not found' } })

  const ask = parseFrame('{"jsonrpc":"2.0","id":"srq-7","method":"approval","params":{"command":"rm -rf build"}}')
  assert.deepEqual(ask, { kind: 'server-request', id: 'srq-7', method: 'approval' })

  for (const junk of ['', 'not json', '[]', '"str"', '42', '{}', '{"jsonrpc":"2.0","method":"event"}', '{"jsonrpc":"2.0","method":"event","params":{"payload":{}}}', '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"parse error"}}']) {
    assert.equal(parseFrame(junk), null, `should be malformed: ${junk}`)
  }
  assert.equal(parseFrame(Buffer.from('{}')), null)
})

test('outbound frames are JSON-RPC 2.0', () => {
  assert.deepEqual(JSON.parse(requestFrame(3, 'prompt.submit', { session_id: 's', text: 't' })), { jsonrpc: '2.0', id: 3, method: 'prompt.submit', params: { session_id: 's', text: 't' } })
  assert.deepEqual(JSON.parse(errorResponseFrame('srq-1', -32601, 'no')), { jsonrpc: '2.0', id: 'srq-1', error: { code: -32601, message: 'no' } })
})

test('the reply is the final text when Hermes sends one, else the streamed deltas — never both', () => {
  assert.equal(finalText({ text: 'Маркер: VIOLET-624', status: 'complete' }, 'Маркер: VIOLET-624'), 'Маркер: VIOLET-624')
  assert.equal(finalText({ text: '', status: 'complete' }, 'зі стріму'), 'зі стріму')
  assert.equal(finalText({ text: '   ' }, 'зі стріму'), 'зі стріму')
  assert.equal(finalText(null, 'зі стріму'), 'зі стріму')
  assert.equal(finalText({ text: ['not', 'a', 'string'] }, 'зі стріму'), 'зі стріму')
  assert.equal(turnStatus({ status: 'error' }), 'error')
  assert.equal(turnStatus({ status: 'interrupted' }), 'interrupted')
  assert.equal(turnStatus({ text: 'x' }), 'complete')
  assert.equal(turnStatus(null), 'complete')
})

test('the prompt is the envelope, a blank line, then the words — with only the fields that carry something', () => {
  const prompt = buildPrompt({ text: '  А чого це заблоковано?  ', context: CONTEXT })
  const [envelope, text] = prompt.split('\n\n')
  assert.equal(text, 'А чого це заблоковано?')
  const lines = (envelope ?? '').split('\n')
  assert.equal(lines[0], CONTEXT_OPEN)
  assert.equal(lines[1], CONTEXT_NOTE)
  assert.equal(lines[lines.length - 1], CONTEXT_CLOSE)
  assert.ok(lines.includes('module: projects · screen: detail'))
  assert.ok(lines.includes('entity: blocker · item: b-12'))
  assert.ok(lines.includes('project: p-1'))
  assert.ok(lines.includes('selection: Окремі ключі для клієнтів'))
  assert.ok(lines.includes('filters: status=open'))
  assert.ok(lines.includes('visible: NeverMind 60%; два блокери'))
  assert.ok(lines.includes('blockers: Окремі ключі для клієнтів (critical)'))
  assert.ok(!lines.some((l) => l.startsWith('agent:')), 'a null field is not written')
  assert.ok(CONTEXT_NOTE.includes('Не цитуй'))
})

test('an empty context is a short envelope, and multi-line values are flattened', () => {
  const prompt = buildPrompt({
    text: 'Привіт',
    context: { activeModule: 'control', activeScreen: '', activeEntity: null, selectedItem: null, projectId: null, agentId: null, filters: {}, visibleState: ['перший\nрядок  з   пробілами', '  '], blockers: [], selection: null },
  })
  assert.equal(prompt, `${CONTEXT_OPEN}\n${CONTEXT_NOTE}\nmodule: control\nvisible: перший рядок з пробілами\n${CONTEXT_CLOSE}\n\nПривіт`)
})

test('the seed is the earlier turns as Hermes takes them, without the message being sent now', () => {
  const history = [
    { role: 'user' as const, text: 'Привіт', ts: 1 },
    { role: 'agent' as const, text: 'Привіт! Один чат.', ts: 2 },
    { role: 'user' as const, text: '   ', ts: 3 },
    { role: 'user' as const, text: 'Чому?', ts: 4 },
  ]
  assert.deepEqual(seedMessages(history, 'Чому?'), [
    { role: 'user', content: 'Привіт' },
    { role: 'assistant', content: 'Привіт! Один чат.' },
  ])
  // A different current text keeps the trailing user turn: it is an earlier, unanswered question.
  assert.equal(seedMessages(history, 'Інше').length, 3)
  assert.deepEqual(seedMessages([], 'x'), [])
  const long = Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, text: `m${i}`, ts: i }))
  assert.equal(seedMessages(long, 'none').length, 20)
})
