#!/usr/bin/env node
/**
 * PostToolUse hook for Bash, filtered by `if: "Bash(git merge *)"` in
 * .claude/settings.json. After a real, successful `git merge` it tells Claude
 * to write a new `merge` Project Sync snapshot to Drive «Claude Sync»
 * (CLAUDE.md, the Drive rule). It never writes to Drive itself: a snapshot
 * needs the repo's facts and Claude's judgement, not a script.
 *
 * Silent — exit 0, no output — for everything else: `--abort`, `--quit`,
 * `-h` / `--help`, «Already up to date», other git subcommands
 * (merge-base, mergetool…), other commands, unreadable input. PostToolUse
 * fires only when the Bash call exited 0; a failed or conflicted merge goes
 * to PostToolUseFailure, which this hook does not listen to.
 *
 * The `if` filter is only a first cut: a command Claude Code cannot parse
 * matches every rule, so the command is checked here again.
 */
import { readFileSync } from 'node:fs'
import process from 'node:process'

const FOLDER_ID = '1PfcuB_Y6troEwDSQzglNxL-3_nFUd9qS'
const NO_SYNC_ARGS = new Set(['--abort', '--quit', '-h', '--help'])

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

/** The hook's answer for one PostToolUse payload, or null for silence. */
function decide(input) {
  if (input?.tool_name !== 'Bash') return null
  const command = input.tool_input?.command
  if (typeof command !== 'string') return null
  const merges = gitMerges(command).filter(isSyncMerge)
  if (!merges.length) return null
  const out = `${input.tool_response?.stdout ?? ''}`
  if (merges.length === 1 && /Already up[ -]to[ -]date/i.test(out)) return null   // nothing was merged

  const shown = command.replace(/\s+/g, ' ').trim().slice(0, 160)
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: [
        `Project Sync: успішний git merge виявлено (\`${shown}\`).`,
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
