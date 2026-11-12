// The year dial: a skyline of newcomers per month, release ticks, chapter markers,
// a hover preview of the sky and a draggable playhead.
import { SkyPreview } from './preview.ts'
import type { Beat, SkyData } from './types.ts'
import { $, DAY0, dateOf, esc, monthYear } from './util.ts'

export interface TimelineOptions {
  chapters: Beat[]
  onScrub: (day: number) => void
  /** the user let go of the timeline (pointer up, or a pause after arrow keys) */
  onScrubEnd?: () => void
  onChapter: (chapter: Beat) => void
}

export class Timeline {
  readonly el: HTMLElement
  readonly data: SkyData
  readonly onScrub: (day: number) => void
  readonly onScrubEnd: () => void
  keyTimer: ReturnType<typeof setTimeout> | undefined
  readonly onChapter: (chapter: Beat) => void
  readonly chapters: Beat[]
  readonly preview: SkyPreview
  readonly pop: HTMLDivElement
  readonly markers: HTMLDivElement
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly end: number
  readonly stars: number[]
  readonly dust: number[]
  readonly max: number
  day = 0
  /** day of the personal star's birth, shown as a gold marker */
  personal: number | null = null
  hoverDay: number | null = null
  previewFrame = 0

  constructor(
    el: HTMLElement,
    data: SkyData,
    { onScrub, onScrubEnd, onChapter, chapters }: TimelineOptions
  ) {
    this.el = el
    this.data = data
    this.onScrub = onScrub
    this.onScrubEnd = onScrubEnd ?? (() => {})
    this.onChapter = onChapter
    this.chapters = chapters
    this.preview = new SkyPreview(data)
    this.pop = document.createElement('div')
    this.pop.className = 'tl-preview'
    this.pop.hidden = true
    this.pop.innerHTML =
      '<canvas width="240" height="136"></canvas><p class="tl-title"></p><p class="tl-date"></p>'
    el.appendChild(this.pop)
    this.markers = document.createElement('div')
    this.markers.className = 'tl-markers'
    el.appendChild(this.markers)
    this.canvas = $<HTMLCanvasElement>('canvas', el)
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas not available')
    this.ctx = ctx
    this.end = data.today
    this.renderMarkers()

    // newcomers per month
    const months = Math.ceil(this.end / 30.44) + 1
    const stars = Array.from({ length: months }, () => 0)
    const dust = Array.from({ length: months }, () => 0)
    this.stars = stars
    this.dust = dust
    data.stars.birth.forEach((b, i) => {
      const m = Math.floor(b / 30.44)
      ;(data.stars.kind[i] === 1 ? dust : stars)[m]++
    })
    this.max = Math.max(...this.stars.map((s, i) => s + this.dust[i] * 0.25))

    const toDay = (e: PointerEvent): number => {
      const r = this.canvas.getBoundingClientRect()
      return Math.max(0, Math.min(this.end, ((e.clientX - r.left) / r.width) * this.end))
    }
    let dragging = false
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true
      this.el.classList.add('dragging')
      this.canvas.setPointerCapture(e.pointerId)
      this.onScrub(toDay(e))
    })
    this.canvas.addEventListener('pointermove', (e) => {
      const d = toDay(e)
      if (dragging) this.onScrub(d)
      this.hoverDay = d
      this.draw()
      this.showPreview(d)
    })
    const release = () => {
      if (!dragging) return
      dragging = false
      this.el.classList.remove('dragging')
      this.onScrubEnd()
    }
    this.canvas.addEventListener('pointerup', release)
    this.canvas.addEventListener('pointercancel', release)
    this.canvas.addEventListener('pointerleave', () => {
      if (dragging) return
      this.hoverDay = null
      this.draw()
      this.hidePreview()
    })
    this.canvas.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 365 : 60
      if (e.key === 'ArrowRight') {
        this.onScrub(Math.min(this.end, this.day + step))
        e.preventDefault()
      }
      if (e.key === 'ArrowLeft') {
        this.onScrub(Math.max(0, this.day - step))
        e.preventDefault()
      }
      if (e.key === 'Home') this.onScrub(0)
      if (e.key === 'End') this.onScrub(this.end)
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
        // keyboard steps count as one scrub until the keys rest for a moment
        clearTimeout(this.keyTimer)
        this.keyTimer = setTimeout(() => this.onScrubEnd(), 600)
      }
    })
    new ResizeObserver(() => {
      this.layoutMarkers()
      this.draw()
    }).observe(this.canvas)
  }

  renderMarkers() {
    this.markers.innerHTML = ''
    for (const c of this.chapters) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `tl-marker kind-${c.kind}`
      b.style.setProperty(
        '--c',
        c.kind === 'you' ? '#ffcb6b' : this.data.projects[c.project]?.color || '#ffffff'
      )
      b.setAttribute(
        'aria-label',
        c.kind === 'finale'
          ? 'Show the thank-you'
          : `Jump to chapter: ${c.title}, ${monthYear(c.day)}`
      )
      const show = () => this.showPreview(c.day, c)
      b.addEventListener('pointerenter', show)
      b.addEventListener('focus', show)
      b.addEventListener('pointerleave', () => this.hidePreview())
      b.addEventListener('blur', () => this.hidePreview())
      b.addEventListener('click', () => {
        this.hidePreview()
        this.onChapter(c)
      })
      this.markers.appendChild(b)
    }
    this.layoutMarkers()
  }

  /**
   * Place the markers at their dates, nudging neighbours apart just enough that each
   * one can still be tapped (order is kept, the shift is as small as possible).
   */
  layoutMarkers() {
    const w = this.el.clientWidth
    if (!w) return
    const gap = w < 640 ? 18 : 16
    const buttons = [...this.markers.children] as HTMLElement[]
    const order = this.chapters
      .map((c, k) => ({ k, x: (c.day / this.end) * w }))
      .sort((a, b) => a.x - b.x)
    const xs = spread(
      order.map((o) => o.x),
      gap,
      0,
      w
    )
    order.forEach((o, n) => {
      buttons[o.k].style.left = `${xs[n]}px`
    })
  }

  showPreview(day: number, chapter: Beat | null = null) {
    if (this.previewFrame) cancelAnimationFrame(this.previewFrame)
    this.previewFrame = requestAnimationFrame(() => {
      const canvas = $<HTMLCanvasElement>('canvas', this.pop)
      this.preview.draw(
        canvas,
        day,
        chapter
          ? { project: chapter.kind === 'peak' ? -1 : chapter.project, star: chapter.star ?? -1 }
          : {}
      )
      const title = $('.tl-title', this.pop)
      title.innerHTML = chapter ? esc(chapter.title) : ''
      title.hidden = !chapter
      $('.tl-date', this.pop).textContent = chapter?.year ? String(chapter.year) : monthYear(day)
      const w = this.el.clientWidth,
        x = (day / this.end) * w
      this.pop.style.left = `${Math.max(124, Math.min(w - 124, x))}px`
      this.pop.classList.toggle('chapter', !!chapter)
      this.pop.hidden = false
    })
  }

  hidePreview() {
    if (this.previewFrame) cancelAnimationFrame(this.previewFrame)
    this.pop.hidden = true
  }

  set(day: number) {
    this.day = day
    this.canvas.setAttribute('aria-valuenow', String(Math.round(day)))
    this.canvas.setAttribute('aria-valuetext', this.label(day))
    this.draw()
  }

  label(day: number): string {
    return monthYear(day)
  }

  draw() {
    const c = this.canvas,
      ctx = this.ctx
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = c.clientWidth,
      h = c.clientHeight
    if (!w) return
    if (c.width !== w * dpr) {
      c.width = w * dpr
      c.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const base = h - 18
    const bw = w / this.stars.length
    const xOf = (day: number): number => (day / this.end) * w
    const playX = xOf(this.day)

    const hoverX = this.hoverDay != null ? xOf(this.hoverDay) : null
    for (let m = 0; m < this.stars.length; m++) {
      const x = m * bw
      const past = x <= playX
      // bars near the cursor light up
      const near = hoverX != null ? Math.max(0, 1 - Math.abs(x + bw / 2 - hoverX) / 40) : 0
      const hs = Math.sqrt(this.stars[m] / this.max) * (base - 6)
      const hd = Math.sqrt((this.dust[m] * 0.25) / this.max) * (base - 6)
      const lift = 1 + near * 0.35
      ctx.fillStyle = `rgba(160,190,255,${(past ? 0.32 : 0.1) + near * 0.3})`
      ctx.fillRect(x, base - (hs + hd) * lift, Math.max(1, bw - 0.6), hd * lift)
      ctx.fillStyle =
        near > 0 && !past
          ? `rgba(255,226,163,${0.18 + near * 0.6})`
          : `rgba(235,242,255,${(past ? 0.85 : 0.18) + near * 0.15})`
      ctx.fillRect(x, base - hs * lift, Math.max(1, bw - 0.6), hs * lift)
    }
    // releases (too small to read on phones)
    for (const r of w < 480 ? [] : this.data.releases) {
      const x = xOf(r.day)
      ctx.fillStyle = this.data.projects[r.project]?.color || '#fff'
      ctx.globalAlpha = r.day <= this.day ? 0.9 : 0.3
      ctx.beginPath()
      ctx.arc(x, base + 4, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // years
    ctx.font = '11px "Hanken Grotesk Variable", system-ui, sans-serif'
    ctx.textAlign = 'center'
    const lastYear = dateOf(this.end).getUTCFullYear()
    const every = w < 520 ? 4 : w < 900 ? 2 : 1
    for (let y = 2010; y <= lastYear; y++) {
      const x = xOf((Date.UTC(y, 0, 1) - DAY0) / 86_400_000)
      ctx.fillStyle = 'rgba(200,214,240,0.16)'
      ctx.fillRect(x, base - 2, 1, 4)
      if ((y - 2010) % every === 0) {
        ctx.fillStyle = 'rgba(200,214,240,0.55)'
        ctx.fillText(String(y), Math.min(w - 14, Math.max(14, x + xOf(365) / 2)), h - 2)
      }
    }
    // your birth
    if (this.personal != null) {
      const x = xOf(this.personal)
      ctx.fillStyle = '#ffcb6b'
      ctx.beginPath()
      ctx.moveTo(x, base - 2)
      ctx.lineTo(x - 4, base - 9)
      ctx.lineTo(x + 4, base - 9)
      ctx.fill()
    }
    // ghost playhead under the cursor
    if (hoverX != null) {
      ctx.fillStyle = 'rgba(255,226,163,0.55)'
      ctx.fillRect(hoverX - 0.5, 0, 1, base + 2)
      ctx.beginPath()
      ctx.arc(hoverX, base, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // playhead
    ctx.fillStyle = '#fff'
    ctx.fillRect(playX - 0.75, 0, 1.5, base + 2)
    ctx.beginPath()
    ctx.arc(playX, base, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Given sorted positions, return positions at least `gap` apart within [min, max],
 * moving each one as little as possible (left-to-right pass, then right-to-left).
 */
export function spread(xs: number[], gap: number, min: number, max: number): number[] {
  const out = xs.map((x) => Math.min(max, Math.max(min, x)))
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap)
  if (out.length && out[out.length - 1] > max) {
    out[out.length - 1] = max
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - gap)
  }
  return out
}
