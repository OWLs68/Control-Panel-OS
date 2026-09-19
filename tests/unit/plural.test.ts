/** "5 блокери" is the bug this exists to prevent. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { count, plural } from '../../src/core/plural.js'

test('picks the right Ukrainian form', () => {
  const форма = (n: number) => plural(n, 'блокер', 'блокери', 'блокерів')
  assert.equal(форма(1), 'блокер')
  assert.equal(форма(2), 'блокери')
  assert.equal(форма(4), 'блокери')
  assert.equal(форма(5), 'блокерів')
  assert.equal(форма(11), 'блокерів')  // not "11 блокер"
  assert.equal(форма(21), 'блокер')
  assert.equal(форма(22), 'блокери')
  assert.equal(форма(25), 'блокерів')
  assert.equal(форма(0), 'блокерів')
})

test('count prefixes the number', () => {
  assert.equal(count(3, 'річ', 'речі', 'речей'), '3 речі')
  assert.equal(count(7, 'річ', 'речі', 'речей'), '7 речей')
})
