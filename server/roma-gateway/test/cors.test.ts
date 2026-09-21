import assert from 'node:assert/strict'
import { test } from 'node:test'
import { corsHeaders, parseOrigins } from '../src/cors.ts'

test('a wildcard origin is never accepted', () => {
  assert.equal(parseOrigins('*').size, 0)
  assert.deepEqual([...parseOrigins('https://a.test, *, https://b.test')], ['https://a.test', 'https://b.test'])
})

test('the exact listed origin gets CORS headers; anything else gets none', () => {
  const allowed = parseOrigins('https://owls68.github.io')
  const ok = corsHeaders('https://owls68.github.io', allowed)
  assert.equal(ok['Access-Control-Allow-Origin'], 'https://owls68.github.io')
  assert.equal(ok['Vary'], 'Origin')
  assert.match(ok['Access-Control-Allow-Methods'] ?? '', /OPTIONS/)
  assert.deepEqual(corsHeaders('https://evil.test', allowed), {})
  assert.deepEqual(corsHeaders(undefined, allowed), {})
})
