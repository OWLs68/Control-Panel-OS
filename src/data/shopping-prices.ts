/**
 * `shopping_prices.v1` — what Shopping Scout reports after a scan, as a typed
 * payload on an event (`SystemEvent.data`).
 *
 * The producer's word is not taken for it. This file is the one place the shape
 * is decided, and both sides read it: the gateway refuses an event whose `data`
 * does not pass (Event Center, `POST /api/v1/events`), and the phone drops the
 * `data` of a stored event that does not pass and shows the event as text. A
 * price the phone draws has been through the same checks twice.
 *
 * Deliberately strict: currency is EUR and nothing else; a price is a number
 * with at most cents; the cheapest store must really be the cheapest one; every
 * string and list has a ceiling; the whole payload has a byte ceiling. What
 * comes back out is a rebuilt copy holding only the known fields — an extra key
 * from a producer never travels on.
 *
 * No imports and no DOM: the gateway loads this file straight from `src/`.
 */

export const SHOPPING_PRICES_TYPE = 'shopping_prices.v1'

export interface ShoppingPrice { store: string; price: number }

export interface ShoppingProduct {
  /** Ukrainian name, e.g. «Молоко». */
  name: string
  brand: string
  /** Volume or weight as it is written on the shelf: «1 л», «500 г». */
  size: string
  emoji: string
  prices: ShoppingPrice[]
  /** The store with the lowest price; must be one of `prices` and really the lowest. */
  cheapest: string
}

export interface ShoppingDeal {
  product: string
  store: string
  price: number
  /** The price before the discount, when the producer knows it. */
  was?: number
  /** Last day of the deal, `YYYY-MM-DD`. */
  until?: string
}

export interface ShoppingPricesV1 {
  type: typeof SHOPPING_PRICES_TYPE
  currency: 'EUR'
  /** ISO 8601 with an offset. */
  scannedAt: string
  nextCheckAt: string | null
  storesTotal: number
  storesResponded: number
  products: ShoppingProduct[]
  deals: ShoppingDeal[]
}

export const SHOPPING_LIMITS = {
  /** The JSON of the whole payload, in bytes. Room for the title and detail inside the 16 KB event body. */
  bytes: 12 * 1024,
  products: 20,
  storesPerProduct: 10,
  deals: 20,
  stores: 50,
  name: 80,
  brand: 60,
  size: 30,
  emoji: 16,
  store: 40,
  maxPrice: 10_000,
} as const

export type ShoppingParse =
  | { ok: true; data: ShoppingPricesV1 }
  | { ok: false; field: string }

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
// No control characters, and no line breaks: these strings are labels, never a layout.
function hasControl(v: string): boolean {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i)
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true
  }
  return false
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// A plain field, not a parameter property: the gateway runs this file under Node's type stripping.
class Bad extends Error {
  field: string
  constructor(field: string) {
    super(field)
    this.field = field
  }
}

function text(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string') throw new Bad(field)
  const t = v.trim()
  if (!t || t.length > max || hasControl(t)) throw new Bad(field)
  return t
}

function integer(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Bad(field)
  return v
}

/** A price in euros: finite, above zero, below the ceiling, and no finer than a cent. */
function money(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > SHOPPING_LIMITS.maxPrice) throw new Bad(field)
  if (Math.round(v * 100) / 100 !== v) throw new Bad(field)
  return v
}

function isoTime(v: unknown, field: string): string {
  if (typeof v !== 'string' || !ISO_TIME.test(v) || !Number.isFinite(Date.parse(v))) throw new Bad(field)
  return v
}

/** `YYYY-MM-DD` that is a real calendar day (no 2026-02-31). */
function isoDay(v: unknown, field: string): string {
  if (typeof v !== 'string' || !ISO_DAY.test(v)) throw new Bad(field)
  const d = new Date(`${v}T00:00:00Z`)
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new Bad(field)
  return v
}

function list(v: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new Bad(field)
  return v
}

function byteLength(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length
}

function product(raw: unknown, at: string): ShoppingProduct {
  if (!isRecord(raw)) throw new Bad(at)
  const pricesRaw = list(raw.prices, `${at}.prices`, SHOPPING_LIMITS.storesPerProduct)
  if (pricesRaw.length === 0) throw new Bad(`${at}.prices`)
  const seen = new Set<string>()
  const prices = pricesRaw.map((p, i): ShoppingPrice => {
    if (!isRecord(p)) throw new Bad(`${at}.prices[${i}]`)
    const store = text(p.store, `${at}.prices[${i}].store`, SHOPPING_LIMITS.store)
    if (seen.has(store)) throw new Bad(`${at}.prices[${i}].store`)
    seen.add(store)
    return { store, price: money(p.price, `${at}.prices[${i}].price`) }
  })
  const cheapest = text(raw.cheapest, `${at}.cheapest`, SHOPPING_LIMITS.store)
  const lowest = Math.min(...prices.map((p) => p.price))
  const named = prices.find((p) => p.store === cheapest)
  if (!named || named.price !== lowest) throw new Bad(`${at}.cheapest`)
  return {
    name: text(raw.name, `${at}.name`, SHOPPING_LIMITS.name),
    brand: text(raw.brand, `${at}.brand`, SHOPPING_LIMITS.brand),
    size: text(raw.size, `${at}.size`, SHOPPING_LIMITS.size),
    emoji: text(raw.emoji, `${at}.emoji`, SHOPPING_LIMITS.emoji),
    prices,
    cheapest,
  }
}

function deal(raw: unknown, at: string): ShoppingDeal {
  if (!isRecord(raw)) throw new Bad(at)
  const out: ShoppingDeal = {
    product: text(raw.product, `${at}.product`, SHOPPING_LIMITS.name),
    store: text(raw.store, `${at}.store`, SHOPPING_LIMITS.store),
    price: money(raw.price, `${at}.price`),
  }
  if (raw.was !== undefined && raw.was !== null) {
    out.was = money(raw.was, `${at}.was`)
    if (out.was <= out.price) throw new Bad(`${at}.was`)
  }
  if (raw.until !== undefined && raw.until !== null) out.until = isoDay(raw.until, `${at}.until`)
  return out
}

/** The payload as the producer sent it, checked field by field; on failure, the path of the first bad field. */
export function parseShoppingPrices(raw: unknown): ShoppingParse {
  try {
    if (!isRecord(raw)) throw new Bad('data')
    if (byteLength(raw) > SHOPPING_LIMITS.bytes) throw new Bad('data')
    if (raw.type !== SHOPPING_PRICES_TYPE) throw new Bad('data.type')
    if (raw.currency !== 'EUR') throw new Bad('data.currency')
    const storesTotal = integer(raw.storesTotal, 'data.storesTotal', 1, SHOPPING_LIMITS.stores)
    const data: ShoppingPricesV1 = {
      type: SHOPPING_PRICES_TYPE,
      currency: 'EUR',
      scannedAt: isoTime(raw.scannedAt, 'data.scannedAt'),
      nextCheckAt: raw.nextCheckAt === undefined || raw.nextCheckAt === null ? null : isoTime(raw.nextCheckAt, 'data.nextCheckAt'),
      storesTotal,
      storesResponded: integer(raw.storesResponded, 'data.storesResponded', 0, storesTotal),
      products: list(raw.products, 'data.products', SHOPPING_LIMITS.products).map((p, i) => product(p, `data.products[${i}]`)),
      deals: list(raw.deals, 'data.deals', SHOPPING_LIMITS.deals).map((d, i) => deal(d, `data.deals[${i}]`)),
    }
    return { ok: true, data }
  } catch (err) {
    if (err instanceof Bad) return { ok: false, field: err.field }
    throw err
  }
}

/** The lowest price on a product's shelf, for «від €…». */
export function lowestPrice(p: ShoppingProduct): number {
  return Math.min(...p.prices.map((x) => x.price))
}

/** Every store the scan asked answered. */
export function allStoresResponded(d: ShoppingPricesV1): boolean {
  return d.storesResponded === d.storesTotal
}
