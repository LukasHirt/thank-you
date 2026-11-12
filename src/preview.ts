// A miniature of the sky on a given day, drawn in 2D for the timeline preview.
import type { SkyData } from './types.ts'
const W = 240,
  H = 136

export class SkyPreview {
  readonly data: SkyData
  readonly colors: string[]
  readonly xy: Float32Array

  constructor(data: SkyData) {
    this.data = data
    const s = data.stars
    this.colors = data.projects.map((p) => p.color)
    // landscape layout: world x in [-1.85, 1.85], y in [-1.2, 1.2]
    this.xy = new Float32Array(s.birth.length * 2)
    for (let i = 0; i < s.birth.length; i++) {
      this.xy[i * 2] = ((s.pos[i * 3] + 1.85) / 3.7) * W
      this.xy[i * 2 + 1] = (1 - (s.pos[i * 3 + 1] + 1.2) / 2.4) * H
    }
  }

  draw(
    canvas: HTMLCanvasElement,
    day: number,
    { project = -1, star = -1 }: { project?: number; star?: number } = {}
  ) {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7)
    g.addColorStop(0, '#0b1a36')
    g.addColorStop(1, '#02050d')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    const s = this.data.stars
    // nebula glow of the highlighted constellation
    if (project >= 0) {
      const c = this.data.projects[project].center
      const x = ((c[0] + 1.85) / 3.7) * W,
        y = (1 - (c[1] + 1.2) / 2.4) * H
      const r = ctx.createRadialGradient(x, y, 0, x, y, 46)
      r.addColorStop(0, this.colors[project] + '66')
      r.addColorStop(1, this.colors[project] + '00')
      ctx.fillStyle = r
      ctx.fillRect(0, 0, W, H)
    }
    for (let i = 0; i < s.birth.length && s.birth[i] <= day; i++) {
      const k = s.kind[i]
      const hot = project >= 0 && s.project[i] === project
      ctx.globalAlpha = k === 1 ? 0.35 : hot ? 1 : project >= 0 ? 0.55 : 0.85
      ctx.fillStyle = k === 1 ? '#8fa4d0' : this.colors[s.project[i]]
      const sz = k === 1 ? 0.8 : Math.min(2.4, 0.9 + s.weight[i] * 0.12)
      ctx.fillRect(this.xy[i * 2] - sz / 2, this.xy[i * 2 + 1] - sz / 2, sz, sz)
    }
    ctx.globalAlpha = 1
    if (star >= 0) {
      const x = this.xy[star * 2],
        y = this.xy[star * 2 + 1]
      ctx.strokeStyle = '#ffcb6b'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#ffe2a3'
      ctx.beginPath()
      ctx.arc(x, y, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
