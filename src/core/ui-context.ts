/**
 * The UI context envelope.
 *
 * Crow gets one chat for the whole app, so the chat itself cannot tell where a
 * question came from. This is what tells it: a structured snapshot of the
 * active module, screen, entity and selection, assembled fresh before every
 * message.
 *
 * Structured, not a screenshot. Vision can be added later as an extra tool if
 * the envelope ever turns out to be too thin; it is not the main path.
 */
import { getActiveModuleId, getActiveScreen, getSelection } from './selection.js'
import { getModule } from '../modules/registry.js'
import type { UiContext } from '../hermes/contract.js'

export function buildUiContext(): UiContext {
  const moduleId = getActiveModuleId()
  const mod = getModule(moduleId)
  const fromModule = mod?.context() ?? {}
  const selection = getSelection()

  return {
    activeModule: moduleId,
    activeScreen: fromModule.activeScreen ?? getActiveScreen(),
    activeEntity: fromModule.activeEntity ?? selection?.entity ?? null,
    selectedItem: fromModule.selectedItem ?? selection?.id ?? null,
    projectId: fromModule.projectId ?? selection?.projectId ?? null,
    agentId: fromModule.agentId ?? selection?.agentId ?? null,
    filters: fromModule.filters ?? {},
    visibleState: fromModule.visibleState ?? [],
    blockers: fromModule.blockers ?? [],
    selection: fromModule.selection ?? selection?.label ?? null,
  }
}

/** One line for the chat window, so Roman can see what Crow was told. */
export function describeContext(ctx: UiContext): string {
  const mod = getModule(ctx.activeModule)
  const parts = [mod?.title ?? ctx.activeModule]
  if (ctx.selection) parts.push(ctx.selection)
  else if (ctx.visibleState.length) parts.push(ctx.visibleState[0] as string)
  return `контекст: ${parts.join(' › ')}`
}
