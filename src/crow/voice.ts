/**
 * Ukrainian voice input.
 *
 * Ported from NeverMind's `voice-input.js`: uk-UA, interim results written
 * straight into the field so you can watch the words land, a 1200ms silence
 * timer that ends the take before iOS's own much longer timeout, and — the part
 * that is easy to skip — the button simply does not appear when the browser has
 * no Speech API, rather than appearing and failing.
 */
import { $ } from '../core/dom.js'
import { autoResizeTextarea } from './chat.js'
import { reg } from '../core/delegation.js'
import { showToast } from '../ui/toast.js'

const SILENCE_MS = 1200

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
  onspeechend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

type SpeechCtor = new () => SpeechRecognitionLike

function getSpeechCtor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Set to 'off' by the switch in the settings; absent means on. */
const PREF_KEY = 'roma_voice'

let recognition: SpeechRecognitionLike | null = null
let baseText = ''
let silenceTimer: number | null = null
let available = false
let micButton: HTMLElement | null = null

export function setupVoiceInput(): void {
  const ctor = getSpeechCtor()
  micButton = $('#crow-mic-btn')
  if (!micButton) return
  // No API, no button. A dead microphone is worse than none.
  available = !!ctor
  syncButton()
  if (!ctor) return

  const button = micButton
  reg('crow-voice', () => {
    if (recognition) { stop(); return }
    start(ctor, button)
  })
}

/** Whether this browser has a Speech API at all — the settings row says so. */
export function isVoiceAvailable(): boolean { return available }

export function isVoiceEnabled(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== 'off' } catch { return true }
}

/** The settings switch: off hides the microphone and ends a take in progress. */
export function setVoiceEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(PREF_KEY)
    else localStorage.setItem(PREF_KEY, 'off')
  } catch { /* private mode: the switch still works for this visit */ }
  if (!on) stop()
  syncButton()
}

function syncButton(): void {
  if (micButton) micButton.hidden = !available || !isVoiceEnabled()
}

function start(ctor: SpeechCtor, button: HTMLElement): void {
  const input = $<HTMLTextAreaElement>('#crow-input')
  if (!input) return

  try {
    recognition = new ctor()
  } catch {
    showToast('Голосовий ввід недоступний')
    recognition = null
    return
  }

  recognition.lang = 'uk-UA'
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  baseText = input.value ? `${input.value}${input.value.endsWith(' ') ? '' : ' '}` : ''
  button.classList.add('recording')

  recognition.onresult = (ev) => {
    let interim = ''
    let final = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i]
      if (!result) continue
      const alt = result[0]
      if (!alt) continue
      if (result.isFinal) final += alt.transcript
      else interim += alt.transcript
    }
    input.value = baseText + final + interim
    if (final) baseText = input.value
    autoResizeTextarea(input)
    armSilence()
  }

  // Some engines report the speaker stopping before the silence timer fires.
  recognition.onspeechend = () => stop()

  recognition.onerror = (ev) => {
    // 'no-speech' and 'aborted' are normal in conversation: no toast for those,
    // or every pause turns into an error message.
    const kind = ev.error ?? ''
    if (kind && kind !== 'no-speech' && kind !== 'aborted') showToast('Мікрофон не відповідає')
    cleanup(button)
  }

  recognition.onend = () => cleanup(button)

  try { recognition.start() } catch { cleanup(button) }
}

function armSilence(): void {
  if (silenceTimer !== null) clearTimeout(silenceTimer)
  silenceTimer = window.setTimeout(() => { stop() }, SILENCE_MS)
}

export function stop(): void {
  try { recognition?.stop() } catch { /* already stopped */ }
}

function cleanup(button: HTMLElement): void {
  if (silenceTimer !== null) { clearTimeout(silenceTimer); silenceTimer = null }
  button.classList.remove('recording')
  recognition = null
}
