/**
 * The price card — Shopping Scout's scan (`shopping_prices.v1`), drawn by the
 * app from a fixed template. The producer sends numbers and names, never
 * layout; every string goes through `escapeHtml`.
 *
 *   header   title · when it was scanned · «усі N магазинів відповіли»
 *   products emoji, name, brand · size, «від €…», a price per store, the
 *            cheapest in green — any number of products and stores
 *   deals    the new discounts as a list, or «Нових знижок немає»
 *   footer   when the next check runs
 *
 * A zone with nothing to show is left out (no products, no next check); the
 * order of the zones never changes. The deals zone is never empty: «немає» is
 * an answer, not an absence.
 *
 * There is no donor for this in NeverMind (it has no agent feeds); the card is
 * assembled from the primitives the events rows already use. PORTING.md §3.
 */
import { escapeHtml } from '../core/dom.js'
import { plural } from '../core/plural.js'
import { allStoresResponded, lowestPrice, type ShoppingDeal, type ShoppingPricesV1, type ShoppingProduct } from '../data/shopping-prices.js'

export interface CardOptions {
  now?: number
  /** IANA zone the times are shown in; the device's own by default. */
  timeZone?: string
}

/** `€2,49` — the euro sign first, a comma for the cents, as in a Dutch shop. */
export function eur(n: number): string {
  return `€${n.toFixed(2).replace('.', ',')}`
}

function dayKey(ts: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts)
}

/** «сьогодні, 07:00», «завтра, 07:00», «вчора, 07:00», else «28 вер., 07:00». */
export function whenLabel(iso: string, opts: CardOptions = {}): string {
  const ts = Date.parse(iso)
  const now = opts.now ?? Date.now()
  const time = new Intl.DateTimeFormat('uk-UA', { timeZone: opts.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(ts)
  const today = Date.parse(`${dayKey(now, opts.timeZone)}T00:00:00Z`)
  const day = Date.parse(`${dayKey(ts, opts.timeZone)}T00:00:00Z`)
  const diff = Math.round((day - today) / 86_400_000)
  const word = diff === 0 ? 'сьогодні' : diff === 1 ? 'завтра' : diff === -1 ? 'вчора'
    : new Intl.DateTimeFormat('uk-UA', { timeZone: opts.timeZone, day: 'numeric', month: 'short' }).format(ts)
  return `${word}, ${time}`
}

/** `2026-09-28` → «28.09». */
function dayMonth(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`
}

function storesLine(d: ShoppingPricesV1): { text: string; partial: boolean } {
  if (allStoresResponded(d)) {
    const n = d.storesTotal
    return { text: n === 1 ? 'магазин відповів' : `усі ${n} ${plural(n, 'магазин', 'магазини', 'магазинів')} відповіли`, partial: false }
  }
  if (d.storesResponded === 0) return { text: 'жоден магазин не відповів', partial: true }
  return { text: `відповіли ${d.storesResponded} з ${d.storesTotal} ${plural(d.storesTotal, 'магазину', 'магазинів', 'магазинів')}`, partial: true }
}

function productHtml(p: ShoppingProduct): string {
  // Cheapest first: the reader's eye lands on the answer.
  const prices = [...p.prices].sort((a, b) => a.price - b.price || a.store.localeCompare(b.store))
  return `<div class="price-product">
      <div class="price-product-head">
        <span class="price-emoji" aria-hidden="true">${escapeHtml(p.emoji)}</span>
        <span class="price-product-name"><span class="price-name">${escapeHtml(p.name)}</span><span class="price-meta">${escapeHtml(p.brand)} · ${escapeHtml(p.size)}</span></span>
        <span class="price-from">від ${eur(lowestPrice(p))}</span>
      </div>
      <div class="price-shelf">${prices.map((x) => `<div class="price-store${x.store === p.cheapest ? ' is-cheapest' : ''}"><span>${escapeHtml(x.store)}</span><span>${eur(x.price)}</span></div>`).join('')}</div>
    </div>`
}

function dealHtml(d: ShoppingDeal): string {
  const meta = `${escapeHtml(d.store)}${d.until ? ` · до ${dayMonth(d.until)}` : ''}`
  return `<div class="price-deal">
      <span class="price-product-name"><span class="price-name">${escapeHtml(d.product)}</span><span class="price-meta">${meta}</span></span>
      <span class="price-deal-price">${d.was !== undefined ? `<s>${eur(d.was)}</s> ` : ''}<b>${eur(d.price)}</b></span>
    </div>`
}

export function renderShoppingCard(d: ShoppingPricesV1, opts: CardOptions = {}): string {
  const stores = storesLine(d)
  return `<div class="price-card" data-type="${escapeHtml(d.type)}">
    <div class="price-head">
      <span class="price-title">Ціни в магазинах</span>
      <span class="price-when">${escapeHtml(whenLabel(d.scannedAt, opts))}</span>
      <span class="price-stores-line${stores.partial ? ' is-partial' : ''}">${escapeHtml(stores.text)}</span>
    </div>
    ${d.products.length ? `<div class="price-zone price-products">${d.products.map(productHtml).join('')}</div>` : ''}
    <div class="price-zone price-deals">
      <div class="price-zone-label">Нові знижки</div>
      ${d.deals.length ? d.deals.map(dealHtml).join('') : '<div class="price-none">Нових знижок немає</div>'}
    </div>
    ${d.nextCheckAt ? `<div class="price-foot">Наступна перевірка: ${escapeHtml(whenLabel(d.nextCheckAt, opts))}</div>` : ''}
  </div>`
}
