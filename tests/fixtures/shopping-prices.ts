/**
 * A scan as Shopping Scout will report it (`shopping_prices.v1`): three
 * products, different numbers of stores, one new deal, one store silent.
 * Shared by the unit tests, the gateway tests and the e2e — one fixture, so
 * what is validated is what is drawn.
 */
export const SHOPPING_FIXTURE = {
  type: 'shopping_prices.v1',
  currency: 'EUR',
  scannedAt: '2026-09-29T07:00:12+02:00',
  nextCheckAt: '2026-09-30T07:00:00+02:00',
  storesTotal: 6,
  storesResponded: 5,
  products: [
    {
      name: 'Молоко', brand: 'Campina', size: '1 л', emoji: '🥛', cheapest: 'Dirk',
      prices: [{ store: 'Albert Heijn', price: 1.39 }, { store: 'Dirk', price: 1.09 }, { store: 'Jumbo', price: 1.29 }],
    },
    {
      name: 'Кава мелена', brand: 'Douwe Egberts', size: '500 г', emoji: '☕', cheapest: 'Lidl',
      prices: [{ store: 'Jumbo', price: 5.99 }, { store: 'Lidl', price: 4.79 }],
    },
    {
      name: 'Джин', brand: 'Old Amsterdam', size: '0,7 л', emoji: '🍸', cheapest: 'Dirk',
      prices: [{ store: 'Dirk', price: 2.49 }],
    },
  ],
  deals: [
    { product: 'Old Amsterdam −35%', store: 'Dirk', price: 2.49, was: 3.85, until: '2026-10-04' },
  ],
}

/** A deep copy the test may break on purpose. */
export function shoppingFixture(): typeof SHOPPING_FIXTURE {
  return JSON.parse(JSON.stringify(SHOPPING_FIXTURE)) as typeof SHOPPING_FIXTURE
}
