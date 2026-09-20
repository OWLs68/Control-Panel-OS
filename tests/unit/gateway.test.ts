/** Crow must never show its own plumbing as if it were speech. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeReply } from '../../src/hermes/gateway.js'
import { describeError, GatewayError } from '../../src/hermes/contract.js'

test('a raw JSON body never reaches the user', () => {
  assert.equal(safeReply('{"tool":"save","args":{}}'), 'Зроблено ✓')
  assert.equal(safeReply('[{"a":1}]'), 'Зроблено ✓')
})

test('prose that merely starts with a brace is left alone', () => {
  const text = '{це не json, а просто текст у дужках'
  assert.equal(safeReply(text), text)
})

test('ordinary prose passes through untouched', () => {
  assert.equal(safeReply('Блокер чекає на тебе.'), 'Блокер чекає на тебе.')
})

test('an empty reply becomes something sayable', () => {
  assert.equal(safeReply(''), 'Готово.')
  assert.equal(safeReply('   '), 'Готово.')
})

test('every gateway error has a human sentence, no stack traces', () => {
  const kinds = ['offline', 'unreachable', 'unauthorized', 'rate-limited', 'bad-response', 'not-configured'] as const
  for (const kind of kinds) {
    const text = describeError(new GatewayError(kind, 'internal detail'))
    assert.ok(text.length > 0)
    assert.ok(!text.includes('internal detail'), `${kind} leaked its internal message`)
  }
  assert.equal(describeError(new Error('boom')), 'Щось пішло не так.')
})
