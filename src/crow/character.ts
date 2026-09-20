/**
 * CrowCharacter.
 *
 * Crow is a miniature 3D Roman, standing beside the bubble at the bubble's
 * own height and tilted a little — not a round avatar and not a sticker. The
 * geometry is ours: nothing in NeverMind looks like this, so there was no
 * implementation to copy, only behaviour (collapse, priorities, transitions).
 *
 * The slot is always as wide as the widest pose would be at the current
 * height, so switching pose never changes the layout: with a narrower slot
 * the front pose used to shrink and drop 31px on every reply (ISS-004).
 *
 * Three poses ship now and the component is built to take more: pose selection
 * is data, so a future expression or animation is a new entry here rather than
 * a new branch in whatever happens to be rendering.
 */
export type CrowPose = 'front' | 'idle' | 'talk'

const POSES: Record<CrowPose, { src: string; alt: string; ratio: number }> = {
  // ratio = width / height of the image file; the slot is sized off the widest.
  front: { src: './assets/crow-front.webp', alt: 'Crow', ratio: 568 / 680 },
  idle: { src: './assets/crow-idle.webp', alt: 'Crow', ratio: 390 / 620 },
  talk: { src: './assets/crow-talk.webp', alt: 'Crow говорить', ratio: 340 / 620 },
}

const WIDEST = Math.max(...Object.values(POSES).map((p) => p.ratio))

export interface CrowCharacterOptions {
  pose?: CrowPose
  /** Starting height; `fitTo` follows the bubble from then on. */
  height?: number
  /** Tilt in degrees to the left. */
  tilt?: number
}

export class CrowCharacter {
  readonly node: HTMLElement
  private img: HTMLImageElement
  private pose: CrowPose
  private talkTimer: number | null = null

  constructor(opts: CrowCharacterOptions = {}) {
    const tilt = opts.tilt ?? 10
    this.pose = opts.pose ?? 'front'

    this.node = document.createElement('div')
    this.node.className = 'crow-figure'
    this.node.style.setProperty('--crow-tilt', `${tilt}deg`)
    this.fitTo(opts.height ?? 96)

    this.img = new Image()
    this.img.decoding = 'async'
    this.img.src = POSES[this.pose].src
    this.img.alt = POSES[this.pose].alt

    const shadow = document.createElement('div')
    shadow.className = 'crow-shadow'

    this.node.append(this.img, shadow)

    // Preload the other poses so the first switch does not flash an empty box.
    for (const pose of Object.keys(POSES) as CrowPose[]) {
      if (pose === this.pose) continue
      const pre = new Image()
      pre.src = POSES[pose].src
    }
  }

  /** Size the figure to a height — the bubble's — keeping room for every pose. */
  fitTo(height: number): void {
    if (!(height > 0)) return
    this.node.style.setProperty('--crow-figure-h', `${Math.round(height)}px`)
    this.node.style.width = `${Math.round(height * WIDEST)}px`
  }

  setPose(pose: CrowPose): void {
    if (pose === this.pose) return
    this.pose = pose
    this.img.src = POSES[pose].src
    this.img.alt = POSES[pose].alt
  }

  /** Talking gesture for as long as Crow is producing a reply. */
  startTalking(): void {
    this.setPose('talk')
    this.node.classList.add('is-talking')
  }

  stopTalking(restTo: CrowPose = 'front'): void {
    this.node.classList.remove('is-talking')
    this.setPose(restTo)
  }

  /** A brief gesture, then back to rest — used when a new message appears. */
  sayOnce(durationMs = 2600): void {
    this.startTalking()
    if (this.talkTimer !== null) clearTimeout(this.talkTimer)
    this.talkTimer = window.setTimeout(() => this.stopTalking(), durationMs)
  }

  /** The small figure used in the collapsed strip. */
  static miniature(): HTMLImageElement {
    const img = new Image()
    img.src = POSES.idle.src
    img.alt = 'Crow'
    return img
  }
}
