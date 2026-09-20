/**
 * Entry point.
 *
 * Nothing runs at import time — the whole app starts from `boot()`, once the
 * DOM exists. Import order stays a detail of the bundler rather than a load
 * bearing part of the design.
 */
import { boot } from './core/boot.js'

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
