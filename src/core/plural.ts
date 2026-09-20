/**
 * Ukrainian plurals.
 *
 * `n === 1 ? 'блокер' : 'блокери'` is right up to four and wrong from five on
 * ("5 блокери"). Three forms, picked by the same rule the language uses.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10
  const mod100 = Math.abs(n) % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

/** "3 блокери" — the number and its matching form. */
export function count(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`
}
