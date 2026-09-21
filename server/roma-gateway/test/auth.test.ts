import assert from 'node:assert/strict'
import { test } from 'node:test'
import { identityFrom, isAllowed, parseAllowlist } from '../src/auth.ts'

test('the allowlist is parsed trimmed and case-insensitive', () => {
  const list = parseAllowlist(' Roman@Example.com , other@example.com ,, ')
  assert.deepEqual([...list], ['roman@example.com', 'other@example.com'])
})

test('an empty allowlist admits nobody — fail closed', () => {
  assert.equal(isAllowed('roman@example.com', parseAllowlist('')), false)
  assert.equal(isAllowed('roman@example.com', parseAllowlist(undefined)), false)
})

test('only the Serve identity header counts, and only when listed', () => {
  const list = parseAllowlist('roman@example.com')
  assert.equal(identityFrom({}), null)
  assert.equal(identityFrom({ 'tailscale-user-login': 'Roman@Example.com' }), 'roman@example.com')
  assert.equal(isAllowed(identityFrom({ 'tailscale-user-login': 'roman@example.com' }), list), true)
  assert.equal(isAllowed(identityFrom({ 'tailscale-user-login': 'stranger@example.com' }), list), false)
  assert.equal(isAllowed(null, list), false)
})
