/** `shopping_prices.v1`: the one contract the gateway enforces and the phone re-checks, and the card drawn from it. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseShoppingPrices, SHOPPING_LIMITS } from '../../src/data/shopping-prices.js'
import { eur, renderShoppingCard, whenLabel } from '../../src/ui/shopping-card.js'
import { shoppingFixture, SHOPPING_FIXTURE } from '../fixtures/shopping-prices.js'

function fieldOf(mutate: (d: Record<string, unknown>) => void): string | null {
  const d = shoppingFixture() as unknown as Record<string, unknown>
  mutate(d)
  const r = parseShoppingPrices(d)
  return r.ok ? null : r.field
}

test('the fixture passes, and comes back as a rebuilt copy', () => {
  const r = parseShoppingPrices(SHOPPING_FIXTURE)
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.data, SHOPPING_FIXTURE)
})

test('an extra key from a producer does not travel on', () => {
  const d = shoppingFixture() as unknown as Record<string, unknown>
  d.html = '<b>x</b>'
  ;(d.products as Record<string, unknown>[])[0]!.onclick = 'alert(1)'
  const r = parseShoppingPrices(d)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal('html' in r.data, false)
    assert.equal('onclick' in r.data.products[0]!, false)
  }
})

test('type, currency and the shape of the whole are checked', () => {
  assert.equal(parseShoppingPrices(null).ok, false)
  assert.equal(parseShoppingPrices([]).ok, false)
  assert.equal(fieldOf((d) => { d.type = 'shopping_prices.v2' }), 'data.type')
  assert.equal(fieldOf((d) => { d.currency = 'USD' }), 'data.currency')
  assert.equal(fieldOf((d) => { d.currency = 'eur' }), 'data.currency')
})

test('prices are numbers with at most cents, above zero, below the ceiling', () => {
  for (const bad of ['1.09', 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.099, SHOPPING_LIMITS.maxPrice + 1, null]) {
    assert.equal(fieldOf((d) => { (d.products as { prices: { price: unknown }[] }[])[0]!.prices[0]!.price = bad }), 'data.products[0].prices[0].price', String(bad))
  }
  assert.equal(fieldOf((d) => { (d.deals as { price: unknown }[])[0]!.price = '2,49' }), 'data.deals[0].price')
})

test('the cheapest store must be one of the prices and really the lowest', () => {
  assert.equal(fieldOf((d) => { (d.products as { cheapest: string }[])[0]!.cheapest = 'Jumbo' }), 'data.products[0].cheapest')
  assert.equal(fieldOf((d) => { (d.products as { cheapest: string }[])[0]!.cheapest = 'Plus' }), 'data.products[0].cheapest')
  assert.equal(fieldOf((d) => { (d.products as { prices: { store: string }[] }[])[0]!.prices[1]!.store = 'Albert Heijn' }), 'data.products[0].prices[1].store')   // a store twice
})

test('dates are real: scan time, next check, and the last day of a deal', () => {
  assert.equal(fieldOf((d) => { d.scannedAt = '2026-09-29' }), 'data.scannedAt')
  assert.equal(fieldOf((d) => { d.scannedAt = 'yesterday' }), 'data.scannedAt')
  assert.equal(fieldOf((d) => { d.scannedAt = '2026-09-29T07:00:00' }), 'data.scannedAt')   // no offset
  assert.equal(fieldOf((d) => { d.nextCheckAt = 'soon' }), 'data.nextCheckAt')
  assert.equal(fieldOf((d) => { (d.deals as { until: string }[])[0]!.until = '2026-02-31' }), 'data.deals[0].until')
  assert.equal(fieldOf((d) => { (d.deals as { until: string }[])[0]!.until = '04.10.2026' }), 'data.deals[0].until')
  assert.equal(fieldOf((d) => { d.nextCheckAt = null }), null)
})

test('a deal\'s old price must be higher than its new one', () => {
  assert.equal(fieldOf((d) => { (d.deals as { was: number }[])[0]!.was = 2.49 }), 'data.deals[0].was')
})

test('store counts are whole numbers and responded never exceeds total', () => {
  assert.equal(fieldOf((d) => { d.storesResponded = 7 }), 'data.storesResponded')
  assert.equal(fieldOf((d) => { d.storesTotal = 0 }), 'data.storesTotal')
  assert.equal(fieldOf((d) => { d.storesTotal = 6.5 }), 'data.storesTotal')
})

test('strings are labels: bounded, non-empty, no line breaks or control characters', () => {
  assert.equal(fieldOf((d) => { (d.products as { name: string }[])[0]!.name = 'x'.repeat(SHOPPING_LIMITS.name + 1) }), 'data.products[0].name')
  assert.equal(fieldOf((d) => { (d.products as { name: string }[])[0]!.name = '  ' }), 'data.products[0].name')
  assert.equal(fieldOf((d) => { (d.products as { name: string }[])[0]!.name = 'a\nb' }), 'data.products[0].name')
  assert.equal(fieldOf((d) => { (d.products as { emoji: unknown }[])[0]!.emoji = 5 }), 'data.products[0].emoji')
})

test('lists have ceilings, and the whole payload has a byte ceiling', () => {
  const product = (i: number) => ({ name: `P${i}`, brand: 'B', size: '1 л', emoji: '🥛', cheapest: 'S0', prices: [{ store: 'S0', price: 1 }] })
  assert.equal(fieldOf((d) => { d.products = Array.from({ length: SHOPPING_LIMITS.products + 1 }, (_, i) => product(i)) }), 'data.products')
  assert.equal(fieldOf((d) => { d.products = Array.from({ length: SHOPPING_LIMITS.products }, (_, i) => product(i)) }), null)
  assert.equal(fieldOf((d) => {
    (d.products as { prices: unknown[]; cheapest: string }[])[0]!.prices = Array.from({ length: SHOPPING_LIMITS.storesPerProduct + 1 }, (_, i) => ({ store: `S${i}`, price: 1 + i }))
    ;(d.products as { cheapest: string }[])[0]!.cheapest = 'S0'
  }), 'data.products[0].prices')
  assert.equal(fieldOf((d) => { d.deals = Array.from({ length: SHOPPING_LIMITS.deals + 1 }, () => ({ product: 'x', store: 'y', price: 1 })) }), 'data.deals')
  // Twenty products with ten stores each, long names: past 12 KB whatever the lists allow.
  assert.equal(fieldOf((d) => {
    d.products = Array.from({ length: SHOPPING_LIMITS.products }, (_, i) => ({
      name: 'н'.repeat(SHOPPING_LIMITS.name), brand: 'б'.repeat(SHOPPING_LIMITS.brand), size: '1 л', emoji: '🥛', cheapest: 'Магазин-00',
      prices: Array.from({ length: SHOPPING_LIMITS.storesPerProduct }, (_, j) => ({ store: `Магазин-${String(j).padStart(2, '0')}${'я'.repeat(20)}`.slice(0, 40), price: 1 + j + i / 100 })),
    }))
  }), 'data')
})

test('no products and no next check: those zones are gone, the deals zone stays and says «немає»', () => {
  const d = shoppingFixture() as unknown as Record<string, unknown>
  d.products = []; d.deals = []; d.nextCheckAt = null
  const r = parseShoppingPrices(d)
  assert.equal(r.ok, true)
  if (!r.ok) return
  const html = renderShoppingCard(r.data, { now: Date.parse('2026-09-29T09:00:00+02:00'), timeZone: 'Europe/Amsterdam' })
  assert.equal(html.includes('price-products'), false)
  assert.equal(html.includes('price-foot'), false)
  assert.match(html, /Нових знижок немає/)
})

const NOW = Date.parse('2026-09-29T09:00:00+02:00')
const AMS = { now: NOW, timeZone: 'Europe/Amsterdam' } as const

test('the card: header, products, deals, footer — in that order', () => {
  const r = parseShoppingPrices(SHOPPING_FIXTURE)
  assert.ok(r.ok)
  const html = renderShoppingCard(r.data, AMS)
  const at = (s: string) => html.indexOf(s)
  assert.ok(at('price-head') < at('price-products') && at('price-products') < at('price-deals') && at('price-deals') < at('price-foot'))
  assert.match(html, /сьогодні, 07:00/)
  assert.match(html, /відповіли 5 з 6 магазинів/)
  assert.match(html, /Наступна перевірка: завтра, 07:00/)
  assert.match(html, /від €1,09/)
  assert.match(html, /до 04\.10/)
  assert.match(html, /<s>€3,85<\/s> <b>€2,49<\/b>/)
})

test('all stores answered reads as «усі N магазинів відповіли»', () => {
  const d = shoppingFixture()
  d.storesResponded = 6
  const r = parseShoppingPrices(d)
  assert.ok(r.ok)
  const html = renderShoppingCard(r.data, AMS)
  assert.match(html, /усі 6 магазинів відповіли/)
  assert.equal(html.includes('is-partial'), false)
})

test('the cheapest store of each product is marked, and only that one', () => {
  const r = parseShoppingPrices(SHOPPING_FIXTURE)
  assert.ok(r.ok)
  const html = renderShoppingCard(r.data, AMS)
  const marked = [...html.matchAll(/price-store is-cheapest"><span>([^<]+)<\/span><span>([^<]+)</g)].map((m) => `${m[1]} ${m[2]}`)
  assert.deepEqual(marked, ['Dirk €1,09', 'Lidl €4,79', 'Dirk €2,49'])
  // Cheapest first inside a product.
  assert.ok(html.indexOf('Dirk</span><span>€1,09') < html.indexOf('Albert Heijn</span><span>€1,39'))
})

test('nothing the producer sent reaches the page as markup', () => {
  const d = shoppingFixture()
  d.products[0]!.name = '<img src=x onerror=alert(1)>'
  d.products[0]!.emoji = '<b>'
  d.deals[0]!.store = 'Dirk"><script>'
  const r = parseShoppingPrices(d)
  assert.ok(r.ok)
  const html = renderShoppingCard(r.data, AMS)
  assert.equal(html.includes('<img'), false)
  assert.equal(html.includes('<script'), false)
  assert.equal(html.includes('emoji" aria-hidden="true"><b>'), false)
  assert.match(html, /&lt;img/)
})

test('money and dates read the way a Dutch shop and a Ukrainian speaker write them', () => {
  assert.equal(eur(2.5), '€2,50')
  assert.equal(eur(10), '€10,00')
  assert.match(whenLabel('2026-09-28T07:00:00+02:00', AMS), /^вчора, 07:00$/)
  assert.match(whenLabel('2026-10-05T18:30:00+02:00', AMS), /, 18:30$/)
})
