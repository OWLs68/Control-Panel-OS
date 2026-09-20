/**
 * The module registry.
 *
 * One entry per module, and adding a module means adding exactly one entry —
 * no edits in five other places. The entry says what it is called, what it
 * draws, whether it can be hidden, what Crow should know while it is on screen,
 * and what Crow opens with there.
 */
import type { CrowChip } from '../hermes/contract.js'

export interface ModuleContext {
  activeScreen?: string
  activeEntity?: string | null
  selectedItem?: string | null
  projectId?: string | null
  agentId?: string | null
  filters?: Record<string, string>
  /** Short lines describing what is visible, in Roman's words not the DOM's. */
  visibleState?: string[]
  blockers?: string[]
  selection?: string | null
}

export interface CrowGreeting {
  title: string
  text: string
  priority: 'normal' | 'urgent' | 'success'
  chips: CrowChip[]
}

export interface ModuleDef {
  id: string
  /** Short label for the drum. */
  label: string
  /** Full name for the modules sheet. */
  title: string
  /** Sub-label in the sheet, e.g. 'ядро · головна'. */
  kind: string
  group: 'core' | 'personal'
  icon: string
  /** Control is the home screen and cannot be switched off. */
  canHide: boolean
  defaultOn: boolean
  render(root: HTMLElement): void
  context(): ModuleContext
  greeting(): CrowGreeting
}

const MODULES: ModuleDef[] = []

export function registerModule(def: ModuleDef): void {
  if (MODULES.some((m) => m.id === def.id)) return
  MODULES.push(def)
}

export function allModules(): ModuleDef[] { return [...MODULES] }

export function getModule(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id)
}

export const HOME_MODULE_ID = 'control'
