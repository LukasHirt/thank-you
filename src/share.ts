// Draws the personal thank-you image (1200x630) on the user's device.
import type { PersonDetail, SkyData } from './types.ts'
const W = 1200,
  H = 630

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function rng(seed: string): () => number {
  let s = 0
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

export async function renderCard(
  person: PersonDetail,
  data: SkyData,
  { year }: { year: string }
): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const proj = data.projects[data.stars.project[person.i]]

  // sky
  const g = ctx.createRadialGradient(W * 0.72, H * 0.45, 20, W * 0.72, H * 0.45, W * 0.8)
  g.addColorStop(0, '#16305c')
  g.addColorStop(0.5, '#0a1630')
  g.addColorStop(1, '#030711')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.72, H * 0.45, 0, W * 0.72, H * 0.45, 340)
  glow.addColorStop(0, proj.color + '55')
  glow.addColorStop(1, proj.color + '00')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const r = rng(person.login)
  for (let k = 0; k < 420; k++) {
    const x = r() * W,
      y = r() * H,
      s = r() ** 3 * 2.4 + 0.3
    ctx.fillStyle = `rgba(230,238,255,${0.25 + r() * 0.6})`
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.fill()
  }
  // collaborators as stars around yours, connected
  const cx = W * 0.72,
    cy = H * 0.45
  const pts = person.collab.map((_: number, k: number): [number, number] => {
    const a = (k / Math.max(1, person.collab.length)) * Math.PI * 2 + 0.6
    const d = 120 + r() * 110
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8]
  })
  ctx.strokeStyle = 'rgba(255,203,107,0.35)'
  ctx.lineWidth = 1.2
  for (const [x, y] of pts) {
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  for (const [x, y] of pts) {
    ctx.fillStyle = '#fff3d6'
    ctx.shadowColor = '#ffe2a0'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.arc(x, y, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
  // your star
  ctx.shadowColor = '#ffcb6b'
  ctx.shadowBlur = 60
  ctx.fillStyle = '#ffd98a'
  ctx.beginPath()
  ctx.arc(cx, cy, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,217,138,0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx - 46, cy)
  ctx.lineTo(cx + 46, cy)
  ctx.moveTo(cx, cy - 46)
  ctx.lineTo(cx, cy + 46)
  ctx.stroke()

  // avatar
  const avatar = await loadImage(
    `https://avatars.githubusercontent.com/${encodeURIComponent(person.login)}?s=192`
  )
  if (avatar) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(110, 120, 46, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(avatar, 64, 74, 92, 92)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,217,138,0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(110, 120, 48, 0, Math.PI * 2)
    ctx.stroke()
  }

  // text
  await document.fonts.ready
  ctx.fillStyle = '#f4f1ff'
  ctx.font = '300 74px "Fraunces Variable", Georgia, serif'
  ctx.fillText('Thank you,', 64, 270)
  ctx.font = '500 74px "Fraunces Variable", Georgia, serif'
  const handle = `@${person.login}`
  let size = 74
  while (ctx.measureText(handle).width > 620 && size > 34) {
    size -= 4
    ctx.font = `500 ${size}px "Fraunces Variable", Georgia, serif`
  }
  ctx.fillStyle = '#ffd98a'
  ctx.fillText(handle, 64, 270 + size + 8)

  ctx.font = '400 26px "Hanken Grotesk Variable", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(226,232,248,0.85)'
  const t = person.totals
  const bits: string[] = []
  if (t.commits) bits.push(`${t.commits.toLocaleString('en')} commit${t.commits === 1 ? '' : 's'}`)
  if (t.prs) bits.push(`${t.prs.toLocaleString('en')} pull request${t.prs === 1 ? '' : 's'}`)
  if (t.reviews) bits.push(`${t.reviews.toLocaleString('en')} review${t.reviews === 1 ? '' : 's'}`)
  if (t.issues) bits.push(`${t.issues.toLocaleString('en')} issue${t.issues === 1 ? '' : 's'}`)
  ctx.fillText(`A star in the ownCloud sky since ${year}.`, 64, 470)
  ctx.fillText(bits.slice(0, 3).join(', '), 64, 508)
  ctx.font = '400 20px "Hanken Grotesk Variable", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(200,210,235,0.6)'
  ctx.fillText(
    `${person.persona[0]}  ·  one of ${data.totals.people.toLocaleString('en')} people who built ownCloud`,
    64,
    574
  )
  return c
}
