/**
 * The shared building blocks. Every screen draws from here, so a change to a
 * card's padding lands everywhere at once instead of in nine near-copies.
 */
import { escapeHtml } from '../core/dom.js'
import { icons, type IconName } from './icons.js'
import type { Origin, Sourced } from '../data/types.js'

export type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'amber'

export function card(head: string, body: string): string {
  return `<div class="card">${head}${body}</div>`
}

export function cardHead(icon: IconName, title: string, trailing = ''): string {
  return `<div class="card-head">${icons[icon]}<span>${escapeHtml(title)}</span><span class="spacer"></span>${trailing}</div>`
}

export function badge(text: string, tone: Tone = 'neutral', mono = false): string {
  return `<span class="badge badge-${tone}${mono ? ' badge-mono' : ''}">${escapeHtml(text)}</span>`
}

export function dot(tone: 'success' | 'warning' | 'error' | 'idle'): string {
  return `<span class="dot dot-${tone}"></span>`
}

export interface RowOptions {
  title: string
  sub?: string
  lead?: string
  trailing?: string
  action?: string
  data?: Record<string, string>
}

export function row(opts: RowOptions): string {
  const attrs = Object.entries(opts.data ?? {})
    .map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`)
    .join('')
  const tag = opts.action ? 'button' : 'div'
  const actionAttr = opts.action ? ` data-action="${escapeHtml(opts.action)}"` : ''
  return `<${tag} class="card-row"${actionAttr}${attrs}>
    ${opts.lead ?? ''}
    <span class="card-row-body">
      <span class="card-row-title">${escapeHtml(opts.title)}</span>
      ${opts.sub ? `<span class="card-row-sub">${escapeHtml(opts.sub)}</span>` : ''}
    </span>
    ${opts.trailing ?? ''}
  </${tag}>`
}

export interface MetricTap { action: string; data?: Record<string, string> }

/** A tile; with `tap` it is a <button> that opens whatever owns the number. */
export function metric(value: number | string, label: string, icon: IconName, tone: Tone, tap?: MetricTap): string {
  const bg: Record<Tone, string> = {
    neutral: 'var(--ink-soft)', success: 'var(--success-soft)', warning: 'var(--warning-soft)',
    error: 'var(--error-soft)', info: 'var(--info-soft)', amber: 'var(--amber-soft)',
  }
  const fg: Record<Tone, string> = {
    neutral: 'var(--secondary)', success: 'var(--success)', warning: 'var(--warning)',
    error: 'var(--error)', info: 'var(--info)', amber: 'var(--amber)',
  }
  const tag = tap ? 'button' : 'div'
  const attrs = tap
    ? ` data-action="${escapeHtml(tap.action)}"` +
      Object.entries(tap.data ?? {}).map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`).join('')
    : ''
  // Spans, not divs: the tile may be a <button>, and they take their own line via CSS.
  return `<${tag} class="metric"${attrs}>
    <span class="metric-ico" style="background:${bg[tone]};color:${fg[tone]}">${icons[icon]}</span>
    <span class="metric-num">${escapeHtml(value)}</span>
    <span class="metric-lbl">${escapeHtml(label)}</span>
  </${tag}>`
}

export function progress(percent: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  return `<div class="progress" role="progressbar" aria-valuenow="${clamped}" aria-valuemin="0" aria-valuemax="100">
    <div class="progress-fill" style="width:${clamped}%"></div>
  </div>`
}

export function empty(icon: IconName, title: string, sub: string): string {
  return `<div class="empty">
    <div class="empty-ico">${icons[icon]}</div>
    <div class="empty-title">${escapeHtml(title)}</div>
    <div class="empty-sub">${escapeHtml(sub)}</div>
  </div>`
}

const ORIGIN_LABEL: Record<Origin, string> = { mock: 'демо', live: 'наживо', local: 'локально' }

/** Says out loud whether what you are reading is a fixture, the live system, or data kept on this device. */
export function sourceTag(src: Sourced<unknown>): string {
  const label = ORIGIN_LABEL[src.origin]
  return `<span class="source-tag" data-origin="${src.origin}" title="${escapeHtml(src.source)}">${label}</span>`
}

export function dataNotice(text: string): string {
  return `<div class="data-notice">${icons.alert}<span>${escapeHtml(text)}</span></div>`
}

export function button(label: string, action: string, variant: 'primary' | 'dark' | 'ghost' = 'ghost', icon?: IconName): string {
  return `<button class="btn btn-${variant}" data-action="${escapeHtml(action)}">${icon ? icons[icon] : ''}${escapeHtml(label)}</button>`
}
