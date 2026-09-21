import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGBrainReader, factsFromToolResult } from '../src/gbrain.ts'

test('facts come out of structuredContent or the first text block', () => {
  const facts = [{ id: 1 }]
  assert.deepEqual(factsFromToolResult({ structuredContent: { facts, total: 1 } }), facts)
  assert.deepEqual(factsFromToolResult({ content: [{ type: 'text', text: JSON.stringify({ facts }) }] }), facts)
  assert.deepEqual(factsFromToolResult({ content: [{ type: 'text', text: 'not json' }] }), [])
  assert.deepEqual(factsFromToolResult(null), [])
})

test('a tool error is an error, not an empty feed', () => {
  assert.throws(() => factsFromToolResult({ isError: true, content: [] }))
})

test('the reader calls recall with the limit and nothing else', async () => {
  const calls: Array<[string, Record<string, unknown>]> = []
  const reader = createGBrainReader(async (name, args) => {
    calls.push([name, args])
    return { structuredContent: { facts: [{ id: 5 }] } }
  })
  const rows = await reader.recentFacts(7)
  assert.deepEqual(calls, [['recall', { limit: 7 }]])
  assert.deepEqual(rows, [{ id: 5 }])
})
