/**
 * What is on screen right now.
 *
 * Kept in its own module with no imports of its own, so screens can record a
 * selection and the context builder can read it without the two importing each
 * other. Deliberately small: this is the thing Crow is told about, so anything
 * that is not visible to Roman has no business being in here.
 */
import { UI_CONTEXT_CHANGED } from './events.js'

export interface Selection {
  /** Type of the thing being looked at, e.g. 'blocker' or 'project'. */
  entity: string
  id: string
  /** How Roman would refer to it out loud. */
  label: string
  projectId?: string
  agentId?: string
}

let activeModuleId = 'control'
let activeScreen = 'list'
let selection: Selection | null = null

export function getActiveModuleId(): string { return activeModuleId }
export function getActiveScreen(): string { return activeScreen }
export function getSelection(): Selection | null { return selection }

export function setActiveModule(id: string): void {
  if (activeModuleId === id) return
  activeModuleId = id
  activeScreen = 'list'
  // Moving module clears the selection: whatever was open is no longer on
  // screen, and a stale selection is worse than none — Crow would answer about
  // something Roman can't see.
  selection = null
  announce()
}

export function setSelection(next: Selection | null, screen = next ? 'detail' : 'list'): void {
  selection = next
  activeScreen = screen
  announce()
}

function announce(): void {
  window.dispatchEvent(new CustomEvent(UI_CONTEXT_CHANGED))
}
