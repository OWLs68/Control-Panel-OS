import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factCategory, mapFacts, parseRawFact, toMemoryFact } from '../src/mapping.ts'

// A row exactly as the installed GBrain (0.51) returned it on 21.09.
const REAL_ROW = {
  id: 78,
  fact: 'Правила вирішення конфліктів джерел у Roman AI OS: runtime/current canonical source перемагає.',
  kind: 'preference',
  entity_slug: 'roman-ai-os',
  visibility: 'world',
  notability: 'medium',
  valid_from: '2026-09-20T22:53:17.918Z',
  valid_until: null,
  expired_at: null,
  superseded_by: null,
  source: 'Роман сказав у чаті з Claude, 2026-09-21',
  confidence: 1,
  created_at: '2026-09-20T22:53:19.774Z',
  fact_id: '78',
  provenance: 'Роман сказав у чаті з Claude, 2026-09-21',
}

test('the category rule, as agreed', () => {
  assert.equal(factCategory('preference', 'roman-ai-os'), 'preference')
  assert.equal(factCategory('fact', 'people/alice'), 'person')
  assert.equal(factCategory('fact', 'projects/roma-os'), 'project')
  assert.equal(factCategory('fact', 'roman-ai-os'), 'system')   // bare slug — falls through, by the rule
  assert.equal(factCategory('event', null), 'system')
})

test('a real GBrain row becomes a full MemoryFact with GBrain\'s own id and times', () => {
  const raw = parseRawFact(REAL_ROW)
  assert.ok(raw)
  const fact = toMemoryFact(raw)
  assert.equal(fact.id, '78')
  assert.equal(fact.text, REAL_ROW.fact)
  assert.equal(fact.category, 'preference')
  assert.equal(fact.ts, Date.parse('2026-09-20T22:53:17.918Z'))   // valid_from, the event time
  assert.equal(fact.created_at, '2026-09-20T22:53:19.774Z')
  assert.equal(fact.updated_at, fact.created_at)
  assert.equal(fact.deleted_at, null)
  assert.equal(fact.user_id, null)
  assert.equal(fact.hlc, null)
})

test('ts falls back to created_at when valid_from is missing', () => {
  const raw = parseRawFact({ ...REAL_ROW, valid_from: null })
  assert.ok(raw)
  assert.equal(toMemoryFact(raw).ts, Date.parse(REAL_ROW.created_at))
})

test('a numeric id stands in when fact_id is absent; nothing is invented otherwise', () => {
  const raw = parseRawFact({ ...REAL_ROW, fact_id: undefined })
  assert.equal(raw?.fact_id, '78')
  assert.equal(parseRawFact({ ...REAL_ROW, fact_id: undefined, id: undefined }), null)
  assert.equal(parseRawFact({ ...REAL_ROW, fact: '   ' }), null)
  assert.equal(parseRawFact({ ...REAL_ROW, created_at: 'not a date' }), null)
  assert.equal(parseRawFact(null), null)
  assert.equal(parseRawFact('text'), null)
})

test('mapFacts keeps the good rows and counts the dropped ones', () => {
  const { facts, dropped } = mapFacts([REAL_ROW, { id: 1 }, 'junk', { ...REAL_ROW, id: 79, fact_id: '79' }])
  assert.equal(facts.length, 2)
  assert.equal(dropped, 2)
  assert.deepEqual(facts.map((f) => f.id), ['78', '79'])
  assert.deepEqual(mapFacts('not an array'), { facts: [], dropped: 0 })
})
