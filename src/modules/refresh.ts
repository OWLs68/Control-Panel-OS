/** Ask the shell to redraw the module currently on screen. Event, not import. */
export const REFRESH = 'roma-refresh-module'

export function rerenderActiveModule(): void {
  window.dispatchEvent(new CustomEvent(REFRESH))
}
