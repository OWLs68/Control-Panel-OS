/** The envelope is the one-way door: if it drifts, a future sync breaks. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLive, nowISO, softDelete, stampEntity } from '../../src/core/entity.js'
import { generateUUID } from '../../src/core/uuid.js'

test('stampEntity fills every envelope field', () => {
  const rec = stampEntity({ title: 'привіт' })
  assert.match(rec.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(rec.user_id, null)
  assert.equal(rec.deleted_at, null)
  assert.equal(rec.hlc, null)
  assert.equal(rec.created_at, rec.updated_at)
  assert.equal(rec.title, 'привіт')
})

test('stampEntity keeps created_at but always moves updated_at', async () => {
  const first = stampEntity({ title: 'a' })
  await new Promise((r) => setTimeout(r, 5))
  const second = stampEntity(first)
  assert.equal(second.created_at, first.created_at)
  assert.equal(second.id, first.id)
  assert.notEqual(second.updated_at, first.updated_at)
})

test('a stale updated_at on the input cannot win', () => {
  const stamped = stampEntity({ title: 'a', updated_at: '2000-01-01T00:00:00.000Z' })
  assert.notEqual(stamped.updated_at, '2000-01-01T00:00:00.000Z')
})

test('soft delete leaves a tombstone rather than removing the row', () => {
  const rec = stampEntity({ title: 'a' })
  assert.equal(isLive(rec), true)
  const gone = softDelete(rec)
  assert.equal(isLive(gone), false)
  assert.equal(gone.id, rec.id)
  assert.ok(gone.deleted_at)
})

test('uuid v7 values sort by creation time', async () => {
  const a = generateUUID()
  await new Promise((r) => setTimeout(r, 3))
  const b = generateUUID()
  assert.ok(a < b, `${a} should sort before ${b}`)
})

test('nowISO is UTC ISO 8601', () => {
  assert.match(nowISO(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
})
