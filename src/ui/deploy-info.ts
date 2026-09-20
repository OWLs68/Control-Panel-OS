/**
 * The version badge and the deploy-info sheet — NeverMind's `#deploy-version`
 * badge and `showDeployInfo` (`nav.js:1373–1440`), so Roman can tell on the
 * phone which build he is looking at.
 *
 * The badge reads `v19` over `21.09 00:58` — the deploy number, then the day
 * and the time the build was made (Kyiv); the donor writes the same inline.
 * build.js stamps them, with the commit and the branch, into dist/index.html;
 * a local build says `vdev`.
 * Tapping it opens the donor's rows — version, commit, branch — plus one
 * button the donor does not have: «Оновити застосунок», which drops the
 * service worker and every cache and reloads, for the day the phone insists
 * on an old build.
 */
import { reg } from '../core/delegation.js'
import { $, escapeHtml } from '../core/dom.js'
import { openSheet } from './sheet.js'

const REPO = 'https://github.com/OWLs68/Control-Panel-OS'
const SHEET_ID = 'deploy-info'

export interface DeployInfo {
  version: string
  commit: string
  branch: string
  built: string
}

/** What build.js stamped into the badge; a local build reads vdev / local / dev. */
export function readDeployInfo(): DeployInfo {
  const badge = $('#deploy-version')
  return {
    version: badge ? ($('.deploy-badge-num', badge)?.textContent?.trim() || 'vdev') : 'vdev',
    commit: badge?.dataset.commit || 'local',
    branch: badge?.dataset.branch || 'dev',
    built: badge?.dataset.built || '',
  }
}

/** «v19 · 21.09 00:58», or «vdev» for a local build. */
export function deployLabel(info: DeployInfo = readDeployInfo()): string {
  return info.built && info.version !== 'vdev' ? `${info.version} · ${info.built}` : info.version
}

export function setupDeployInfo(): void {
  reg('show-deploy-info', showDeployInfo)
  // Drop the worker and every cache, then load the page from the network.
  reg('hard-refresh', () => { void hardRefresh() })
}

export function showDeployInfo(): void {
  const info = readDeployInfo()
  const commitCell = info.commit !== 'local'
    ? `<a href="${REPO}/commit/${escapeHtml(info.commit)}" target="_blank" rel="noopener">${escapeHtml(info.commit)}</a>`
    : escapeHtml(info.commit)

  openSheet({
    id: SHEET_ID,
    title: 'Інфо про деплой',
    subtitle: 'Що зараз на телефоні',
    body: `
      <div class="deploy-rows">
        ${row('Версія', escapeHtml(deployLabel(info)))}
        ${row('Коміт', commitCell)}
        ${row('Гілка', escapeHtml(info.branch))}
      </div>
      <div class="deploy-hint">Якщо номер не змінився після деплою — CI ще не доробив або
        телефон тримає стару збірку. Закрий застосунок повністю і відкрий знову,
        або натисни кнопку нижче.</div>
      <div class="deploy-actions">
        <button class="btn btn-dark btn-block" data-action="hard-refresh">Оновити застосунок</button>
      </div>`,
  })
}

function row(label: string, value: string): string {
  return `<div class="deploy-row"><span class="deploy-row-label">${label}</span><span class="deploy-row-value">${value}</span></div>`
}

export async function hardRefresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } finally {
    // A query string the worker never saw: the network, not the HTTP cache.
    location.replace(`${location.pathname}?fresh=${Date.now()}`)
  }
}
