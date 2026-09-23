/** A module added after the bar was saved: offered once, nothing else moves. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ADDED_LATER, offerAddedModules } from '../../src/nav/module-state.js'

const LATER = [{ id: 'work', after: 'control' }]
const registered = (...ids: string[]) => (id: string) => ids.includes(id)
const ALL = registered('control', 'work', 'agents', 'projects', 'memory', 'events')

test('«Задачі» is the module being offered, right after Control', () => {
  assert.deepEqual(ADDED_LATER, [{ id: 'work', after: 'control' }])
})

test('an existing bar gets the new module once, right after Control, and keeps its own order', () => {
  const next = offerAddedModules({ active: ['control', 'events', 'agents'], added: [] }, ALL, LATER)
  assert.deepEqual(next, { active: ['control', 'work', 'events', 'agents'], added: ['work'] })
})

test('idempotent: running it again changes nothing', () => {
  const once = offerAddedModules({ active: ['control', 'agents'], added: [] }, ALL, LATER)
  assert.deepEqual(offerAddedModules(once, ALL, LATER), once)
})

test('hidden after the offer stays hidden', () => {
  const next = offerAddedModules({ active: ['control', 'agents'], added: ['work'] }, ALL, LATER)
  assert.deepEqual(next, { active: ['control', 'agents'], added: ['work'] })
})

test('a fresh install only records the offer — its defaults already bring the module', () => {
  assert.deepEqual(offerAddedModules({ active: null, added: [] }, ALL, LATER), { active: null, added: ['work'] })
})

test('a bar that already has the module is left as it is', () => {
  const next = offerAddedModules({ active: ['control', 'agents', 'work'], added: [] }, ALL, LATER)
  assert.deepEqual(next, { active: ['control', 'agents', 'work'], added: ['work'] })
})

test('a module this build does not register is left for a later build, not marked as offered', () => {
  const next = offerAddedModules({ active: ['control', 'agents'], added: [] }, registered('control', 'agents'), LATER)
  assert.deepEqual(next, { active: ['control', 'agents'], added: [] })
})

test('a bar saved without Control gets the module in front, where Control will join it', () => {
  const next = offerAddedModules({ active: ['agents', 'events'], added: [] }, ALL, LATER)
  assert.deepEqual(next.active, ['work', 'agents', 'events'])
})

test('the saved state it was given is not mutated', () => {
  const active = ['control', 'agents']
  const added: string[] = []
  offerAddedModules({ active, added }, ALL, LATER)
  assert.deepEqual(active, ['control', 'agents'])
  assert.deepEqual(added, [])
})
