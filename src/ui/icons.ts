/** Inline SVG, one stroke weight, one corner style — so the set reads as one family. */
const s = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const icons = {
  home: s('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/>'),
  agents: s('<rect x="4" y="7.5" width="16" height="12" rx="3"/><circle cx="9" cy="13" r="1.1" fill="currentColor"/><circle cx="15" cy="13" r="1.1" fill="currentColor"/><path d="M12 4v3.5"/>'),
  projects: s('<path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  memory: s('<path d="M9 4.5A3.2 3.2 0 0 0 5.8 8 2.9 2.9 0 0 0 4 10.7c0 1 .5 2 1.3 2.5A3 3 0 0 0 8 18a3 3 0 0 0 4-1.2V5.6A3 3 0 0 0 9 4.5z"/><path d="M15 4.5A3.2 3.2 0 0 1 18.2 8 2.9 2.9 0 0 1 20 10.7c0 1-.5 2-1.3 2.5A3 3 0 0 1 16 18a3 3 0 0 1-4-1.2"/>'),
  events: s('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/>'),
  cube: s('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'),
  alert: s('<path d="M12 4.5 2.8 20h18.4z"/><path d="M12 10v4M12 17h.01"/>'),
  play: s('<path d="M8 5.5v13l10-6.5z"/>'),
  check: s('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>'),
  chevron: s('<path d="m9 5.5 6.5 6.5L9 18.5"/>'),
  chevronUp: s('<path d="m5.5 15 6.5-6.5 6.5 6.5"/>'),
  chevronDown: s('<path d="m5.5 9 6.5 6.5L18.5 9"/>'),
  sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>'),
  mic: s('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>'),
  send: s('<path d="M4.5 12h14"/><path d="m13 6.5 5.5 5.5L13 17.5"/>'),
  map: s('<path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>'),
  trash: s('<path d="M4 6.5h16M9.5 6.5V4.5h5v2M7 6.5 8 20h8l1-13.5"/>'),
  bolt: s('<path d="M13 3 5.5 13.5H11L10 21l8-11h-5.5z"/>'),
  wallet: s('<rect x="3" y="6.5" width="18" height="12" rx="2.5"/><path d="M16 3.5H7a2 2 0 0 0-2 2v1h12z"/><circle cx="12" cy="12.5" r="1.8"/>'),
  moon: s('<path d="M20 13.2A8.2 8.2 0 1 1 10.8 4a6.4 6.4 0 0 0 9.2 9.2z"/>'),
  person: s('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  lock: s('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  note: s('<path d="M13 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5z"/><path d="M13 3.5v6h6M8.5 14h7"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  refresh: s('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4.5h-4.5"/>'),
  broom: s('<path d="M4 20 10.5 13.5"/><path d="m13 4 7 7-6.5 6.5a2 2 0 0 1-2.8 0L8.5 15.3a2 2 0 0 1 0-2.8z"/>'),
} as const

export type IconName = keyof typeof icons
