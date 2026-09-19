/**
 * The palette is fixed by Stage 0, so the job here is not to second-guess it
 * but to check what the fixed colours do when they meet — and to pin the one
 * decision that came out of it: text on amber is dark ink, never white.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

function luminance(hex: string): number {
  const v = hex.replace('#', '')
  const channel = (i: number) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACE = '#FFF9F2'
const BG = '#F6F0E6'
const AMBER = '#D58A1F'
const INK = '#262A2F'

test('secondary text on a card clears AA for body text', () => {
  const ratio = contrast('#6D6A65', SURFACE)
  assert.ok(ratio >= 4.5, `#6D6A65 on ${SURFACE} is ${ratio.toFixed(2)}:1`)
})

test('secondary text also clears AA on the app background', () => {
  assert.ok(contrast('#6D6A65', BG) >= 4.5)
})

test('primary text is comfortably above AAA', () => {
  assert.ok(contrast('#202326', SURFACE) >= 7)
})

test('white on amber would fail AA — which is why nothing uses it for text', () => {
  assert.ok(contrast('#FFFFFF', AMBER) < 4.5)
})

test('dark ink on amber clears AA, so amber surfaces carry ink text', () => {
  const ratio = contrast(INK, AMBER)
  assert.ok(ratio >= 4.5, `ink on amber is ${ratio.toFixed(2)}:1`)
})
