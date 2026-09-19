/**
 * Renders the PWA icon set from inline SVG using the Playwright Chromium that
 * is already a dev dependency. No image-processing package is added just for
 * eight PNGs.
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs into public/icons/. Re-run after changing the glyph below.
 */
import { chromium } from '@playwright/test'
import { resolveChromiumPath } from './chromium-path.mjs'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BG = '#0e1117'

/** The glyph, drawn on a 64-unit grid: three signal rows with status colours. */
const glyph = `
  <rect x="12" y="17" width="40" height="5" rx="2.5" fill="#6b8afd"/>
  <circle cx="24" cy="19.5" r="4.5" fill="#e6eaf2"/>
  <rect x="12" y="29.5" width="40" height="5" rx="2.5" fill="#3f8f63"/>
  <circle cx="40" cy="32" r="4.5" fill="#e6eaf2"/>
  <rect x="12" y="42" width="40" height="5" rx="2.5" fill="#d99a2b"/>
  <circle cx="31" cy="44.5" r="4.5" fill="#e6eaf2"/>
`

/**
 * `inset` shrinks the glyph toward the centre. Maskable icons need their
 * content inside the middle 80% so platform masks cannot crop it.
 */
function svg({ size, radius, inset = 0 }) {
  const scale = (64 - inset * 2) / 64
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="${radius}" fill="${BG}"/>
    <g transform="translate(${inset} ${inset}) scale(${scale})">${glyph}</g>
  </svg>`
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, radius: 14 },
  { file: 'icon-512.png', size: 512, radius: 14 },
  // Maskable: square (the platform applies the mask) with a generous safe zone.
  { file: 'maskable-512.png', size: 512, radius: 0, inset: 9 },
  // iOS applies its own corner radius and does not support transparency.
  { file: 'apple-touch-icon.png', size: 180, radius: 0 },
]

const browser = await chromium.launch({ executablePath: resolveChromiumPath() })
try {
  await mkdir(OUT, { recursive: true })
  for (const target of TARGETS) {
    const page = await browser.newPage({
      viewport: { width: target.size, height: target.size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<!doctype html><style>*{margin:0;padding:0}html,body{width:${target.size}px;height:${target.size}px;overflow:hidden}</style>${svg(target)}`,
    )
    await page.screenshot({ path: join(OUT, target.file), omitBackground: false })
    await page.close()
    console.log(`✓ ${target.file} (${target.size}×${target.size})`)
  }
} finally {
  await browser.close()
}
