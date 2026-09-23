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
/** Which of ADDED_LATER have already been offered to this device's bar. */
const ADDED_KEY = 'roma_modules_added'

/**
 * Modules that arrived after people had already saved their bar. A saved list
 * wins over `defaultOn` (see getEnabledModuleIds), so without this a new
 * module would stay invisible until someone went looking for it in «Модулі».
 * Each id here is put into a saved bar once, right after `after`, and then
 * recorded — so hiding it later sticks, and nothing else moves.
 */
export const ADDED_LATER: ReadonlyArray<{ id: string; after: string }> = [
  { id: 'work', after: HOME_MODULE_ID },   // «Задачі», 23.09
]

export interface ModuleBarState {
  /** The saved bar, or null on a fresh install (the defaults apply). */
  active: string[] | null
  /** Ids from ADDED_LATER already offered once. */
  added: string[]
}

/**
 * Pure: the bar after offering every not-yet-offered module once. Nothing is
 * removed or reordered, the inputs are not mutated, and a module this build
 * does not register is left for a later build rather than marked as offered.
 * A fresh install only records the offer — its defaults already carry the
 * module.
 */
export function offerAddedModules(
  state: ModuleBarState,
  isRegistered: (id: string) => boolean,
  later: ReadonlyArray<{ id: string; after: string }> = ADDED_LATER,
): ModuleBarState {
  const active = state.active ? [...state.active] : null
  const added = [...state.added]
  for (const { id, after } of later) {
    if (added.includes(id) || !isRegistered(id)) continue
    // A bar saved without its anchor (an old one missing Control) gets the
    // module in front; getEnabledModuleIds puts Control back ahead of it.
    if (active && !active.includes(id)) active.splice(active.indexOf(after) + 1, 0, id)
    added.push(id)
  }
  return { active, added }
}

function readIds(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) return parsed as string[]
  } catch { /* unreadable storage reads as nothing saved */ }
  return null
}

/** Once per boot, after the modules are registered. Idempotent by ADDED_KEY. */
export function migrateModuleState(): void {
  const active = readIds(KEY)
  const added = readIds(ADDED_KEY) ?? []
  const next = offerAddedModules({ active, added }, (id) => getModule(id) !== undefined)
  try {
    if (next.active && next.active.length !== (active?.length ?? 0)) localStorage.setItem(KEY, JSON.stringify(next.active))
    if (next.added.length !== added.length) localStorage.setItem(ADDED_KEY, JSON.stringify(next.added))
  } catch { /* private mode: the bar shows the defaults and nothing is lost */ }
}

function defaults(): string[] {
  return allModules().filter((m) => m.defaultOn).map((m) => m.id)
}

export function getEnabledModuleIds(): string[] {
  const stored = readIds(KEY)
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
