// "Your story": Wrapped-style cards over the sky.
import { renderCard } from './share.ts'
import type { ContributionType, PersonDetail, SkyData } from './types.ts'
import { $, avatar, esc, fmt as n, longDate as fmtDate, plural } from './util.ts'

const FIRST_KIND: Record<ContributionType, string> = {
  commit: 'Your first commit',
  pr: 'Your first pull request',
  issue: 'The first issue you opened',
  review: 'Your first review'
}

/** The HTML of every card in a person's story (cards without data are left out). */
export function cards(p: PersonDetail, data: SkyData): { list: string[]; year: string } {
  const proj = data.projects[data.stars.project[p.i]]
  const year = p.born.slice(0, 4)
  const list: string[] = []
  const sinceYears = new Date().getUTCFullYear() - Number(year)

  list.push(`
    <div class="card card-hello">
      <img class="avatar big" src="${avatar(p.login, 240)}" alt="" />
      <p class="lede">Hello, <strong>@${esc(p.login)}</strong>.</p>
      <h2>Your star first lit up on ${fmtDate(p.born)}.</h2>
      <p>${sinceYears > 0 ? `That was ${plural(sinceYears, 'year')} ago. ` : ''}It lives in the ${esc(proj.name)} constellation.</p>
      ${p.first.date < p.born ? `<p>Your work goes back even further, to ${p.first.date.slice(0, 4)}, before it became part of ownCloud.</p>` : ''}
    </div>`)

  list.push(`
    <div class="card">
      <p class="lede">${FIRST_KIND[p.first.type]}, in <strong>${esc(p.first.repo)}</strong></p>
      ${p.first.text ? `<blockquote>“${esc(p.first.text)}”</blockquote>` : '<blockquote>A careful look at someone else’s work.</blockquote>'}
      <p>Everything after this started here.</p>
    </div>`)

  if (p.repos.length) {
    list.push(`
      <div class="card">
        <p class="lede">Where you spent your time</p>
        <ol class="bars">
          ${p.repos.map(([r, pct]) => `<li><span class="bar-label">${esc(r)}</span><span class="bar" style="--w:${Math.max(4, pct)}%"></span><span class="bar-value">${pct}%</span></li>`).join('')}
        </ol>
        ${p.totals.repos > p.repos.length ? `<p>…and ${plural(p.totals.repos - p.repos.length, 'more repository', 'more repositories')}.</p>` : ''}
      </div>`)
  }

  const yearKeys = Object.keys(p.years)
  const busiest = p.busiest
  if (busiest && (yearKeys.length > 1 || busiest.count > 3)) {
    const max = Math.max(...Object.values(p.years))
    const first = Number(yearKeys[0]),
      last = Number(yearKeys[yearKeys.length - 1])
    const cols: string[] = []
    for (let y = first; y <= last; y++)
      cols.push(
        `<span class="col${y === busiest.year ? ' peak' : ''}" style="--h:${((p.years[y] || 0) / max) * 100}%" title="${y}: ${p.years[y] || 0}"><i>${String(y).slice(2)}</i></span>`
      )
    list.push(`
      <div class="card">
        <p class="lede">Your busiest year</p>
        <h2 class="huge">${busiest.year}</h2>
        <div class="cols">${cols.join('')}</div>
        <p>Active in ${plural(yearKeys.length, 'year')}${yearKeys.length > 1 ? `, from ${first} to ${last}` : ''}.</p>
      </div>`)
  }

  const hourMax = Math.max(1, ...p.hours)
  if (p.hours.reduce((a, b) => a + b, 0) >= 10) {
    const peakHour = p.hours.indexOf(hourMax)
    list.push(`
      <div class="card">
        <p class="lede">Your rhythm</p>
        <div class="clock" role="img" aria-label="Commits by hour of day, most at ${String(peakHour).padStart(2, '0')}:00">
          ${p.hours.map((h, k) => `<span class="${k === peakHour ? 'peak' : ''}" style="--r:${k * 15}deg;--h:${0.08 + 0.92 * (h / hourMax)}"></span>`).join('')}
          ${[0, 6, 12, 18].map((h) => `<i style="--r:${h * 15}deg">${String(h).padStart(2, '0')}</i>`).join('')}
          <b>${String(peakHour).padStart(2, '0')}:00<small>your peak hour</small></b>
        </div>
        <p>Your favourite hour to commit, in your own time zone.</p>
      </div>`)
  }

  const t = p.totals
  const stats: [number, string, string][] = (
    [
      [t.commits, 'commit', 'commits'],
      [t.prs, 'pull request', 'pull requests'],
      [t.reviews, 'review', 'reviews'],
      [t.issues, 'issue opened', 'issues opened']
    ] satisfies [number, string, string][]
  ).filter(([v]) => v > 0)
  list.push(`
    <div class="card">
      <p class="lede">What you gave</p>
      <dl class="stats">${stats.map(([v, one, many]) => `<div><dt>${n(v)}</dt><dd>${v === 1 ? one : many}</dd></div>`).join('')}</dl>
      ${t.merged ? `<p>${plural(t.merged, 'pull request')} merged. Every one of them is part of ownCloud today.</p>` : '<p>Every one of them made ownCloud better.</p>'}
    </div>`)

  if (p.collab.length) {
    list.push(`
      <div class="card">
        <p class="lede">You shared the sky with</p>
        <ul class="people">${p.collab
          .map((i) => data.stars.login[i])
          .filter((l): l is string => !!l)
          .map(
            (l) =>
              `<li><img class="avatar" src="${avatar(l, 120)}" alt="" /><span>@${esc(l)}</span></li>`
          )
          .join('')}</ul>
        <p>The gold lines in the sky connect you.</p>
      </div>`)
  }

  list.push(`
    <div class="card card-persona">
      <p class="lede">In the ownCloud sky, you are</p>
      <h2 class="huge">${esc(p.persona[0])}</h2>
      <p>${esc(p.persona[1])}</p>
    </div>`)

  list.push(`
    <div class="card card-thanks">
      <h2>Thank you, @${esc(p.login)}.</h2>
      <p>ownCloud exists because people like you showed up. This sky is a little brighter because of you.</p>
      <div class="share-preview"><span class="loading">Painting your card…</span></div>
      <div class="share-actions">
        <button type="button" data-act="download">Download image</button>
        <button type="button" data-act="share">Share…</button>
        <button type="button" data-act="copy">Copy your link</button>
      </div>
    </div>`)
  return { list, year }
}

export interface StoryOptions {
  onClose?: () => void
  linkFor: (login: string) => string
}

type ShareAction = 'download' | 'share' | 'copy'

export class Story {
  readonly root: HTMLElement
  readonly data: SkyData
  readonly onClose?: () => void
  readonly linkFor: (login: string) => string
  readonly duration = 6500
  person: PersonDetail | null = null
  year = ''
  index = -1
  cards: HTMLElement[] | null = null
  bars: HTMLElement[] = []
  canvas: HTMLCanvasElement | null = null
  timer: ReturnType<typeof setTimeout> | undefined
  toastTimer: ReturnType<typeof setTimeout> | undefined
  /** bumped on every open, so a card painted for a previous person is thrown away */
  generation = 0

  constructor(root: HTMLElement, data: SkyData, { onClose, linkFor }: StoryOptions) {
    this.root = root
    this.data = data
    this.onClose = onClose
    this.linkFor = linkFor
    root.addEventListener('click', (e) => {
      const target = e.target as Element
      const act = target.closest<HTMLElement>('[data-act]')
      if (act) return void this.#action(act.dataset.act as ShareAction)
      if (target.closest('.story-close')) return this.close()
      const bar = target.closest<HTMLElement>('[data-card]')
      if (bar) return this.go(Number(bar.dataset.card))
      if (target.closest('.share-actions, a, button')) return
      const r = root.getBoundingClientRect()
      if (e.clientX - r.left < r.width * 0.3) this.go(this.index - 1)
      else this.go(this.index + 1)
    })
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close()
      if (e.key === 'ArrowRight') this.go(this.index + 1)
      if (e.key === 'ArrowLeft') this.go(this.index - 1)
    })
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  open(person: PersonDetail) {
    clearTimeout(this.timer)
    this.generation++
    this.person = person
    this.canvas = null
    const { list, year } = cards(person, this.data)
    this.year = year
    this.root.innerHTML = `
      <div class="story-progress">${list.map((_, k) => `<button type="button" data-card="${k}" aria-label="Go to card ${k + 1} of ${list.length}"><span><i></i></span></button>`).join('')}</div>
      <button type="button" class="story-close" aria-label="Close your story">×</button>
      <div class="story-cards">${list.join('')}</div>`
    this.cards = [...this.root.querySelectorAll<HTMLElement>('.card')]
    this.bars = [...this.root.querySelectorAll<HTMLElement>('.story-progress i')]
    this.root.hidden = false
    document.body.classList.add('story-open')
    this.root.focus()
    this.index = -1
    this.go(0)
  }

  go(target: number) {
    const cards = this.cards
    if (!cards) return
    if (target >= cards.length) return // stay on the last card
    const i = Math.max(0, target)
    this.index = i
    cards.forEach((c, k) => c.classList.toggle('on', k === i))
    this.bars.forEach((b, k) => {
      b.style.transition = 'none'
      b.style.width = k < i ? '100%' : '0%'
    })
    clearTimeout(this.timer)
    const bar = this.bars[i]
    if (i < cards.length - 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          bar.style.transition = `width ${this.duration}ms linear`
          bar.style.width = '100%'
        })
      )
      this.timer = setTimeout(() => this.go(i + 1), this.duration)
    } else bar.style.width = '100%'
    if (i === cards.length - 1) void this.#paint()
  }

  async #card(): Promise<HTMLCanvasElement | null> {
    const person = this.person
    if (!person) return null
    if (this.canvas) return this.canvas
    const generation = this.generation
    const canvas = await renderCard(person, this.data, { year: this.year })
    if (generation !== this.generation) return null // someone else's story is open now
    this.canvas = canvas
    return canvas
  }

  async #paint() {
    const canvas = await this.#card()
    const box = this.root.querySelector('.share-preview')
    if (!canvas || !box || !this.person) return
    box.innerHTML = ''
    const img = new Image()
    img.alt = `Thank-you card for @${this.person.login}`
    try {
      img.src = canvas.toDataURL('image/png')
    } catch {
      /* tainted canvas: avatar blocked */
    }
    box.appendChild(img)
  }

  async #action(act: ShareAction) {
    const person = this.person
    if (!person) return
    const url = this.linkFor(person.login)
    const text = `I'm one of the ${n(this.data.totals.everyone)} stars in the ownCloud sky. Thank you to everyone who built it.`
    if (act === 'copy') {
      await navigator.clipboard.writeText(url)
      this.#toast('Link copied')
      return
    }
    const canvas = await this.#card()
    if (!canvas) return
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const file = new File([blob], `owncloud-thank-you-${person.login}.png`, { type: 'image/png' })
    if (act === 'share') {
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text, url })
        } catch {
          /* cancelled */
        }
        return
      }
      return this.#shareMenu(text, url)
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    this.#toast('Image downloaded')
  }

  #shareMenu(text: string, url: string) {
    const actions = $('.share-actions', this.root)
    if (actions.querySelector('.share-links')) return
    const t = encodeURIComponent(text)
    const u = encodeURIComponent(url)
    const div = document.createElement('div')
    div.className = 'share-links'
    div.innerHTML = `
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" target="_blank" rel="noopener">LinkedIn</a>
      <a href="https://x.com/intent/post?text=${t}&url=${u}" target="_blank" rel="noopener">X</a>
      <a href="#" data-mastodon>Mastodon</a>`
    $('[data-mastodon]', div).addEventListener('click', (e) => {
      e.preventDefault()
      const inst = prompt(
        'Your Mastodon server (for example mastodon.social)',
        localStorage.getItem('mastodon') || 'mastodon.social'
      )
      if (!inst) return
      localStorage.setItem('mastodon', inst)
      const host = inst.replace(/^https?:\/\//, '').replace(/\/.*/, '')
      window.open(
        `https://${host}/share?text=${encodeURIComponent(`${text} ${url}`)}`,
        '_blank',
        'noopener'
      )
    })
    actions.appendChild(div)
    this.#toast('Download the image to attach it to your post')
  }

  #toast(msg: string) {
    const el = $('.toast')
    el.textContent = msg
    el.classList.add('on')
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => el.classList.remove('on'), 2400)
  }

  close() {
    clearTimeout(this.timer)
    this.generation++
    this.root.hidden = true
    document.body.classList.remove('story-open')
    this.root.innerHTML = ''
    this.cards = null
    this.canvas = null
    this.onClose?.()
  }
}
