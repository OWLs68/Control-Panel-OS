/**
 * Which modules are in the bottom bar, and in what order.
 *
 * Hiding is not deleting: a hidden module keeps its data, keeps answering the
 * context builder if you land on it, and comes back with everything intact.
 * Control is filtered back in unconditionally — it is the home screen, and a
 * stored list from an older build must not be able to strip it out.
 */
import { allModules, HOME_MODULE_ID, getModule } from '../modules/registry.js'

const KEY = 'roma_active_modules'

function defaults(): string[] {
  return allModules().filter((m) => m.defaultOn).map((m) => m.id)
}

export function getEnabledModuleIds(): string[] {
  let stored: string[] | null = null
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) stored = parsed as string[]
  } catch { /* unreadable storage falls back to defaults */ }

  const ids = (stored ?? defaults()).filter((id) => getModule(id) !== undefined)
  if (!ids.includes(HOME_MODULE_ID)) ids.unshift(HOME_MODULE_ID)
  return ids
}

export function saveEnabledModuleIds(ids: string[]): string[] {
  const clean = ids.filter((id) => getModule(id) !== undefined)
  if (!clean.includes(HOME_MODULE_ID)) clean.unshift(HOME_MODULE_ID)
  try { localStorage.setItem(KEY, JSON.stringify(clean)) } catch { /* private mode */ }
  return clean
}

export function isEnabled(id: string): boolean {
  return getEnabledModuleIds().includes(id)
}

/**
 * Order inside the bar; ids not present keep the registry's own order.
 * Nothing moves in front of the first slot — the home module keeps it
 * (NeverMind `moveTabOrder`, nav.js:397: `newIdx < 1` is refused).
 */
export function moveModule(ids: string[], id: string, direction: -1 | 1): string[] {
  const at = ids.indexOf(id)
  const to = at + direction
  if (at < 0 || to < 1 || to >= ids.length) return ids
  const next = [...ids]
  const [moved] = next.splice(at, 1)
  next.splice(to, 0, moved as string)
  return next
}
