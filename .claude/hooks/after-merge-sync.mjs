#!/usr/bin/env node
/**
 * PostToolUse hook for Bash, filtered by `if: "Bash(git merge *)"` in
 * .claude/settings.json. After a real, successful `git merge` that updated
 * `main` it tells Claude to write a new `merge` Project Sync snapshot to
 * Drive «Claude Sync» (CLAUDE.md, the Drive rule). A merge into a working
 * branch gets no snapshot (Roman, 24.09). It never writes to Drive itself: a
 * snapshot needs the repo's facts and Claude's judgement, not a script.
 *
 * «Updated main» is read from git, not guessed from the command: the newest
 * entry of main's reflog is a merge of what this command merged, written
 * while it ran (`duration_ms`). That holds for `git checkout main && git
 * merge … && git checkout -`, and is false for a merge into any other branch
 * — even one made seconds after a merge into main.
 *
 * Silent — exit 0, no output — for everything else: `--abort`, `--quit`,
 * `-h` / `--help`, «Already up to date», a merge that left main alone, other
 * git subcommands (merge-base, mergetool…), other commands, unreadable input
 * or a git that cannot answer. PostToolUse
 * fires only when the Bash call exited 0; a failed or conflicted merge goes
 * to PostToolUseFailure, which this hook does not listen to.
 *
 * The `if` filter is only a first cut: a command Claude Code cannot parse
 * matches every rule, so the command is checked here again.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

const FOLDER_ID = '1PfcuB_Y6troEwDSQzglNxL-3_nFUd9qS'
const NO_SYNC_ARGS = new Set(['--abort', '--quit', '-h', '--help'])
/** Options whose next word is their value, not a branch to merge. */
const TAKES_VALUE = new Set(['-m', '-F', '-s', '-X', '--message', '--file', '--strategy', '--strategy-option', '--cleanup'])
/** Reflog times are whole seconds; the hook starts a moment after the command. */
const SLACK_S = 2

/** Heredoc bodies and quoted strings are data, not commands: blank them out. */
function commandText(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '<<heredoc')
    .replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""')
}

/** Every `git … merge …` in the command, as its argument list. */
function gitMerges(command) {
  const merges = []
  for (const part of commandText(command).split(/&&|\|\||[;|\n]/)) {
    const words = part.trim().split(/\s+/).filter(Boolean)
    while (words.length && /^\w+=/.test(words[0])) words.shift()   // FOO=bar git merge …
    if (words[0] !== 'git') continue
    let i = 1
    while (i < words.length && words[i].startsWith('-')) {
      i += ['-C', '-c', '--git-dir', '--work-tree'].includes(words[i]) ? 2 : 1   // git -C dir merge …
    }
    if (words[i] === 'merge') merges.push(words.slice(i + 1))
  }
  return merges
}

/** A merge that ran to its end: not aborted, not quit, not help. */
function isSyncMerge(args) {
  return !args.some((a) => NO_SYNC_ARGS.has(a))
}

/** The branches a merge names: `git merge --no-ff -m "…" claude/x` → ['claude/x']. */
function mergedRefs(args) {
  const refs = []
  for (let i = 0; i < args.length; i++) {
    if (TAKES_VALUE.has(args[i])) i++
    else if (!args[i].startsWith('-') && args[i] !== '""' && !args[i].startsWith('<<')) refs.push(args[i])
  }
  return refs
}

/** Does main's reflog subject record one of these merges? */
function recordsMerge(subject, merges) {
  // `git merge --continue` concludes through commit: «commit (merge): Merge branch 'x'».
  if (subject.startsWith('commit (merge)')) return merges.some((args) => args.includes('--continue'))
  const named = /^merge ([^:]+):/.exec(subject)?.[1].split(' ')
  if (!named) return false
  return merges.some((args) => {
    const refs = mergedRefs(args)
    return refs.length === 0 || refs.some((r) => named.includes(r))   // bare `git merge` takes the upstream
  })
}

/**
 * main's new short SHA if one of these merges updated it while the command
 * ran, else null. A merge writes «merge <what>: …» to the branch's reflog.
 */
function mainMergedTo(cwd, durationMs, merges) {
  let line
  try {
    line = execFileSync('git', ['reflog', 'show', '--date=unix', '--format=%h%x09%gd%x09%gs', '-n', '1', 'refs/heads/main'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).trim()
  } catch {
    return null
  }
  const [sha, selector, subject] = line.split('\t')
  const at = Number(/@\{(\d+)\}$/.exec(selector ?? '')?.[1])
  if (!sha || !Number.isFinite(at) || !recordsMerge(subject ?? '', merges)) return null
  const ranFor = typeof durationMs === 'number' ? durationMs / 1000 : 600
  return at >= Date.now() / 1000 - ranFor - SLACK_S ? sha : null
}

/** The hook's answer for one PostToolUse payload, or null for silence. */
function decide(input) {
  if (input?.tool_name !== 'Bash') return null
  const command = input.tool_input?.command
  if (typeof command !== 'string') return null
  const merges = gitMerges(command).filter(isSyncMerge)
  if (!merges.length) return null
  const out = `${input.tool_response?.stdout ?? ''}`
  if (merges.length === 1 && /Already up[ -]to[ -]date/i.test(out)) return null   // nothing was merged
  const main = mainMergedTo(input.cwd || process.cwd(), input.duration_ms, merges)
  if (!main) return null   // a merge into a working branch: no snapshot

  const shown = command.replace(/\s+/g, ' ').trim().slice(0, 160)
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: [
        `Project Sync: успішний git merge оновив main → ${main} (\`${shown}\`).`,
        `До завершення цього merge workflow створи НОВИЙ merge-snapshot у Drive «Claude Sync» (folder ID ${FOLDER_ID}):`,
        'імʼя YYYY-MM-DD_HHMMSS_merge_<short-head>.md; формат і Drive rules — CLAUDE.md, «Правила, які не обговорюються», перший пункт.',
        'Snapshot показує реальні факти: local main, origin/main, push status (push ще попереду — snapshot після нього або явно «не запушено»).',
        'Канонічні документи Drive не змінювати. Drive write failed → явно скажи Роману «Drive sync: FAILED» + причина; нікуди більше не писати.',
      ].join(' '),
    },
  }
}

let input = null
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  // Unreadable input: stay silent, never block the tool call.
}
const answer = decide(input)
if (answer) process.stdout.write(JSON.stringify(answer))
