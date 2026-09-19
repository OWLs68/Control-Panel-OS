/**
 * UUID v7 — time-ordered, so rows sort by creation without a second column and
 * Postgres gets a sane index when this eventually lands in a real database.
 *
 * Ported from NeverMind's decision (`src/core/entity.js`): new records are v7,
 * older v4 values stay valid alongside them — same shape, nothing sorts by id
 * today, so mixing is safe.
 */
export function generateUUID(): string {
  const bytes = new Uint8Array(16)
  cryptoFill(bytes)

  const ms = Date.now()
  bytes[0] = (ms / 2 ** 40) & 0xff
  bytes[1] = (ms / 2 ** 32) & 0xff
  bytes[2] = (ms / 2 ** 24) & 0xff
  bytes[3] = (ms / 2 ** 16) & 0xff
  bytes[4] = (ms / 2 ** 8) & 0xff
  bytes[5] = ms & 0xff
  bytes[6] = 0x70 | ((bytes[6] as number) & 0x0f) // version 7
  bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f) // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function cryptoFill(bytes: Uint8Array): void {
  const c = globalThis.crypto
  if (c?.getRandomValues) { c.getRandomValues(bytes); return }
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
}
