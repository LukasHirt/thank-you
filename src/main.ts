import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/hanken-grotesk'
import './style.css'
import { Sky } from './sky.ts'
import { Timeline } from './timeline.ts'
import { Story } from './story.ts'
import { Sound } from './sound.ts'
import type { Beat, PeopleShard, PersonDetail, Release, SkyData } from './types.ts'
import {
  $,
  DAY0,
  avatar,
  countUpTo,
  dateOf,
  esc,
  fmt,
  lowerBound as lowerBoundIn,
  monthYear,
  shardOf
} from './util.ts'

const BASE = import.meta.env.BASE_URL
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

const AUTOPLAY_SECONDS = 48 // pure travel time; chapters add their holds on top
const HOLD_SECONDS = 4.2
const SLOW_WINDOW = 110 // days before a chapter where time starts to brake

const data = (await fetch(`${BASE}data/sky.json`).then((r) => r.json())) as SkyData
const { stars, totals } = data
const END = data.today

// ---------- lookups
interface Searchable {
  l: string
  ll: string
  i: number
}
const loginIndex = new Map<string, number>()
const searchable: Searchable[] = []
stars.login.forEach((l, i) => {
  if (!l) return
  loginIndex.set(l.toLowerCase(), i)
  searchable.push({ l, ll: l.toLowerCase(), i })
})
const shardCache = new Map<string, Promise<PeopleShard>>()
async function detail(login: string): Promise<PersonDetail | undefined> {
  const k = shardOf(login)
  let shard = shardCache.get(k)
  if (!shard) {
    shard = fetch(`${BASE}data/people/${k}.json`).then((r) => r.json() as Promise<PeopleShard>)
    shardCache.set(k, shard)
  }
  return (await shard)[login.toLowerCase()]
}
const linkFor = (login: string): string =>
  `${location.origin}${location.pathname}?u=${encodeURIComponent(login)}`
const lowerBound = (day: number): number => lowerBoundIn(stars.birth, day)

// ---------- static numbers
const years = new Date().getUTCFullYear() - totals.firstYear
const T: Record<string, string> = {
  people: fmt(totals.everyone),
  commits: fmt(totals.commits),
  prs: fmt(totals.prs),
  reviews: fmt(totals.reviews),
  issues: fmt(totals.issues),
  repos: fmt(totals.repos),
  years: String(years),
  languages: String(totals.languages),
  pulls:
    totals.dockerPulls >= 1e6
      ? `${Math.round(totals.dockerPulls / 1e6)} million`
      : fmt(totals.dockerPulls),
  date: new Date(data.generatedAt).toLocaleDateString('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}
document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
  el.textContent = T[el.dataset.t ?? ''] ?? ''
})

// ---------- WebGL or not
function webglOK() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}
const hasGL = webglOK()
let sky: Sky | null = null
if (hasGL) sky = new Sky($('#sky'), data)
else document.body.classList.add('no-gl')
// keep the sky clear of the search bar and the bottom controls (and, on phones, the year row)
function fitSky() {
  if (!sky) return
  const top = $('.top').getBoundingClientRect().bottom + 8
  const bottomEdge = Math.min(
    $('.year').getBoundingClientRect().top,
    $('.dock').getBoundingClientRect().top
  )
  // on wide screens the big year is decorative and may overlap the sky
  const edge = innerWidth <= 640 ? bottomEdge : $('.dock').getBoundingClientRect().top
  sky.setInsets(top, innerHeight - edge + 8)
}
addEventListener('resize', fitSky)
requestAnimationFrame(fitSky)

// ---------- state
interface State {
  day: number
  playing: boolean
  /** index of the ?u= person */
  personal: number | null
  personalShown: boolean
  selected: number | null
  finaleShown: boolean
  milestoneIdx: number
  releaseIdx: number
  speed: number
  /** the chapter currently on screen */
  beat: { b: Beat; t: number } | null
  lastCode?: number
  lastDust?: number
  scrubAt?: number
}
const state: State = {
  day: 0,
  playing: !reduced && hasGL,
  personal: null,
  personalShown: false,
  selected: null,
  finaleShown: false,
  milestoneIdx: 0,
  releaseIdx: 0,
  speed: 0,
  beat: null
}

const sound = new Sound()
const story = new Story($('#story'), data, {
  linkFor,
  onClose: () => {
    if (state.selected != null) showChip(state.selected)
  }
})
// created after the chapters are known (see below)
// oxlint-disable-next-line no-unassigned-vars
let timeline!: Timeline

// ---------- shooting stars (major releases)
function shootingStar(rel: Release) {
  if (!sky || reduced) return
  const c = data.projects[rel.project]?.center || [0, 0]
  const p = sky.toScreen(c[0], c[1])
  const el = document.createElement('div')
  el.className = 'shooting'
  el.style.setProperty('--x', `${p.x}px`)
  el.style.setProperty('--y', `${p.y - 60}px`)
  el.style.setProperty('--c', data.projects[rel.project]?.color || '#fff')
  el.innerHTML = `<i></i><span>${esc(rel.label)}<small>${dateOf(rel.day).toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</small></span>`
  $('#labels').appendChild(el)
  setTimeout(() => el.remove(), 4200)
}

// ---------- project labels
const labels = data.projects.map((p, pi) => {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'plabel'
  b.textContent = p.name
  b.style.setProperty('--c', p.color)
  b.addEventListener('click', () => {
    if (!sky) return
    const s = sky
    pause()
    if (s.focus === pi) s.focusProject(-1, { instant: reduced })
    else s.focusProject(pi, { instant: reduced })
    labels.forEach((l, k) => l.classList.toggle('focus', s.focus === k))
  })
  $('#labels').appendChild(b)
  return b
})
const projectFirst = data.projects.map(() => Infinity)
stars.birth.forEach((b, i) => {
  if (stars.kind[i] === 0)
    projectFirst[stars.project[i]] = Math.min(projectFirst[stars.project[i]], b)
})
const projectRadius = data.projects.map((p) => p.radius)
function placeLabels() {
  if (!sky) return
  data.projects.forEach((p, pi) => {
    const s = sky.toScreen(p.center[0], p.center[1] + projectRadius[pi] * 0.62 + 0.02)
    const show =
      state.day >= Math.max(projectFirst[pi] + 120, p.since ?? 0) &&
      (sky.focus < 0 || sky.focus === pi) &&
      s.visible
    labels[pi].style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`
    labels[pi].classList.toggle('on', show)
  })
}

// ---------- time
function setDay(d: number, { scrub = false }: { scrub?: boolean } = {}) {
  const prev = state.day
  state.day = Math.max(0, Math.min(END, d))
  if (sky) sky.day = state.day
  timeline.set(state.day)
  $('#year').textContent = String(dateOf(state.day).getUTCFullYear())
  const code = countUpTo(codeBirths, state.day),
    dust = countUpTo(dustBirths, state.day)
  if (code !== state.lastCode || dust !== state.lastDust) {
    state.lastCode = code
    state.lastDust = dust
    $('#count').textContent = `${fmt(code)} ${code === 1 ? 'contributor' : 'contributors'}`
    $('#count-dust').textContent = dust
      ? `${fmt(dust)} issue ${dust === 1 ? 'reporter' : 'reporters'}`
      : ''
  }

  if (scrub) {
    sky?.clearBorn()
    // re-sync event cursors without replaying them
    state.milestoneIdx = beats.findIndex((m) => m.day > state.day)
    if (state.milestoneIdx < 0) state.milestoneIdx = beats.length
    endBeat({ quiet: true })
    state.releaseIdx = data.releases.findIndex((r) => r.day > state.day)
    if (state.releaseIdx < 0) state.releaseIdx = data.releases.length
    return
  }
  if (sky && state.day > prev)
    sky.markBorn(lowerBound(prev + 0.0001), lowerBound(state.day + 0.0001))
  while (
    state.releaseIdx < data.releases.length &&
    data.releases[state.releaseIdx].day <= state.day
  ) {
    shootingStar(data.releases[state.releaseIdx])
    state.releaseIdx++
  }
  if (sound.on && state.playing && state.day > prev) {
    // one sparkle per visible birth ring (code contributors), throttled inside Sound
    for (
      let i = lowerBound(prev + 0.0001);
      i < stars.birth.length && stars.birth[i] <= state.day;
      i++
    ) {
      if (stars.kind[i] !== 1) sound.sparkle(stars.project[i], stars.weight[i])
    }
  }
}
const codeBirths: number[] = []
const dustBirths: number[] = []
stars.birth.forEach((b, i) => (stars.kind[i] === 1 ? dustBirths : codeBirths).push(b))

// ---------- chapters
const beats: Beat[] = [...data.milestones]
function addPersonalBeat(i: number) {
  beats.push({
    day: stars.birth[i],
    kind: 'you',
    star: i,
    title: 'And here you are.',
    sub: `@${stars.login[i]}, this is the moment your star first lit up.`,
    project: stars.project[i]
  })
  beats.sort((a, b) => a.day - b.day)
}
const beatEl = $('#beat')
function words(text: string): string {
  return esc(text)
    .split(' ')
    .map((w, k) => `<span style="--k:${k}">${w}</span>`)
    .join(' ')
}
function starWorld(i: number): [number, number, number] {
  return [stars.pos[i * 3], stars.pos[i * 3 + 1], stars.pos[i * 3 + 2]]
}
function startBeat(b: Beat) {
  state.beat = { b, t: 0 }
  const proj = data.projects[b.project]
  beatEl.className = `beat kind-${b.kind}`
  beatEl.style.setProperty('--c', b.kind === 'you' ? '#ffcb6b' : proj?.color || '#ffffff')
  beatEl.innerHTML = `<p class="beat-date">${b.year ? b.year : esc(dateOf(b.day).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</p>
    <h2 class="beat-title">${words(b.title)}</h2><p class="beat-sub">${esc(b.sub)}</p>`
  beatEl.hidden = false
  requestAnimationFrame(() => beatEl.classList.add('on'))
  document.body.classList.add('in-beat')
  if (!sky) return
  const color = b.kind === 'you' ? '#ffcb6b' : proj?.color || '#ffffff'
  if (b.kind === 'project' || b.kind === 'announce') {
    const c = proj.center
    sky.flyToPoint(c[0], c[1], Math.max(1.05, proj.radius * 4.6), { instant: reduced })
    sky.flareProject(b.project, 1)
    sky.shockwave(c[0], c[1], color, Math.max(0.9, proj.radius * 3.2))
  } else if (b.kind === 'count' || b.kind === 'you') {
    const [x, y, z] = starWorld(b.star ?? 0)
    sky.flyToPoint(x, y, 0.75, { instant: reduced, z })
    sky.shockwave(x, y, color, 0.55, { z })
    if (b.kind === 'count' && state.selected == null && b.star != null) sky.select(b.star, [])
  } else if (b.kind === 'peak' && b.year) {
    sky.flyToPoint(0, 0, sky.baseZ * 1.02, { instant: reduced })
    sky.flareProject(-2, 1)
    // everyone who arrived that year lights up again, one after another
    const y0 = (Date.UTC(b.year, 0, 1) - DAY0) / 86400000,
      y1 = (Date.UTC(b.year + 1, 0, 1) - DAY0) / 86400000
    const from = lowerBound(y0),
      to = lowerBound(Math.min(y1, state.day + 0.0001))
    sky.cascade(from, to, 2.8)
    sound.cascade(-1, to - from, 2.8)
  }
  sound.chapterStart(b.project, { gold: b.kind === 'you' })
}
function endBeat({ quiet = false } = {}) {
  if (!state.beat) return
  const b = state.beat.b
  state.beat = null
  if (sky && !quiet && !reduced) {
    // let go of the moment: a ring collapses back in and the stars breathe out
    const proj = data.projects[b.project]
    if (b.kind === 'project' || b.kind === 'announce') {
      sky.release(b.project)
      sky.shockwave(proj.center[0], proj.center[1], proj.color, Math.max(0.9, proj.radius * 3.2), {
        implode: true,
        dur: 1.5
      })
      sound.chapterRelease(1.5 * 0.88)
    } else if (b.kind === 'count' || b.kind === 'you') {
      const [x, y, z] = starWorld(b.star ?? 0)
      sky.shockwave(x, y, b.kind === 'you' ? '#ffcb6b' : proj?.color || '#ffffff', 0.55, {
        implode: true,
        dur: 1.3,
        z
      })
      sound.chapterRelease(1.3 * 0.88)
    } else if (b.kind === 'peak') {
      sky.release(-2, 1.9)
      sky.shockwave(0, 0, '#dfe8ff', 3.2, { implode: true, dur: 1.8 })
      sound.chapterRelease(1.8 * 0.88)
    }
  }
  beatEl.classList.remove('on')
  document.body.classList.remove('in-beat')
  setTimeout(() => {
    if (!state.beat) beatEl.hidden = true
  }, 900)
  if (sky) {
    sky.unflare()
    if (state.beat == null && state.selected == null) sky.select(state.personal ?? -1, [])
    if (state.selected == null) sky.home()
  }
}
function crescendo() {
  if (!sky || reduced) return showFinale()
  sky.flyToPoint(0, 0, sky.baseZ * 1.06)
  sky.wave()
  sky.shockwave(0, 0, '#ffffff', 3.4)
  sound.finale()
  setTimeout(() => (state.personal != null ? select(state.personal) : showFinale()), 2600)
}

function play() {
  if (state.day >= END) {
    replay()
    return
  }
  state.playing = true
  document.body.classList.add('playing')
  $('#play').setAttribute('aria-label', 'Pause')
}
function pause() {
  state.playing = false
  document.body.classList.remove('playing')
  $('#play').setAttribute('aria-label', 'Play')
}
function replay() {
  hideFinale()
  setDay(0, { scrub: true })
  state.milestoneIdx = 0
  state.releaseIdx = 0
  state.personalShown = false
  state.speed = 0
  endBeat({ quiet: true })
  sky?.focusProject(-1)
  play()
}
$('#play').addEventListener('click', () => (state.playing ? pause() : play()))

// ---------- finale
function showFinale() {
  state.finaleShown = true
  $('#finale').hidden = false
  document.body.classList.add('finale-open')
  requestAnimationFrame(() => $('#finale').classList.add('on'))
}
function hideFinale() {
  $('#finale').classList.remove('on')
  $('#finale').hidden = true
  document.body.classList.remove('finale-open')
}
$('#finale').addEventListener('click', (e) => {
  const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act
  if (act === 'find') {
    hideFinale()
    q.focus()
  }
  if (act === 'explore') hideFinale()
  if (act === 'replay') replay()
})

// ---------- selecting a person
async function select(
  i: number,
  { openStory = true, fly = true }: { openStory?: boolean; fly?: boolean } = {}
) {
  const login = stars.login[i]
  if (!login) return
  hideFinale()
  hideTooltip()
  const p = await detail(login)
  if (!p) return
  state.selected = i
  sky?.select(i, p.collab)
  timeline.personal = stars.birth[i]
  timeline.draw()
  if (sky && fly) {
    sky.focusProject(-1)
    labels.forEach((l) => l.classList.remove('focus'))
    sky.flyTo(i, { instant: reduced })
  }
  history.replaceState(null, '', `?u=${encodeURIComponent(login)}`)
  $('#chip').hidden = true
  if (openStory) setTimeout(() => story.open(p), sky && !reduced ? 1300 : 0)
  else showChip(i)
}
function deselect() {
  state.selected = null
  sky?.select(-1)
  sky?.home()
  timeline.personal = state.personal != null ? stars.birth[state.personal] : null
  timeline.draw()
  $('#chip').hidden = true
  history.replaceState(null, '', location.pathname)
}
function showChip(i: number) {
  const l = stars.login[i]
  if (!l) return
  const chip = $('#chip')
  chip.innerHTML = `<img src="${avatar(l, 48)}" alt="" /><button type="button" class="chip-story">@${esc(l)}’s story</button><button type="button" class="chip-x" aria-label="Clear selection">×</button>`
  chip.hidden = false
  $('.chip-story', chip).onclick = () => void select(i)
  $('.chip-x', chip).onclick = deselect
}

// ---------- search
const q = $<HTMLInputElement>('#q')
const results = $('#results')
let active = 0
let matches: Searchable[] = []
function renderResults() {
  results.innerHTML = matches
    .map(
      (m, k) =>
        `<li role="option" id="r${k}" aria-selected="${k === active}" data-i="${m.i}"><img src="${avatar(m.l, 40)}" alt="" loading="lazy" /><span>@${esc(m.l)}</span><small>${dateOf(stars.birth[m.i]).getUTCFullYear()}</small></li>`
    )
    .join('')
  results.hidden = !matches.length
  q.setAttribute('aria-activedescendant', matches.length ? `r${active}` : '')
}
q.addEventListener('input', () => {
  const s = q.value.trim().replace(/^@/, '').toLowerCase()
  active = 0
  if (!s) {
    matches = []
    return renderResults()
  }
  const pre = [],
    sub = []
  for (const m of searchable) {
    if (m.ll.startsWith(s)) pre.push(m)
    else if (m.ll.includes(s)) sub.push(m)
    if (pre.length >= 8) break
  }
  matches = [...pre, ...sub].slice(0, 8)
  if (!matches.length) {
    results.innerHTML = `<li class="empty">No star for “${esc(s)}” yet. Try the handle you use on GitHub.</li>`
    results.hidden = false
    return
  }
  renderResults()
})
q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    active = Math.min(matches.length - 1, active + 1)
    renderResults()
    e.preventDefault()
  }
  if (e.key === 'ArrowUp') {
    active = Math.max(0, active - 1)
    renderResults()
    e.preventDefault()
  }
  if (e.key === 'Escape') {
    q.value = ''
    matches = []
    renderResults()
    q.blur()
  }
})
$('.search').addEventListener('submit', (e) => {
  e.preventDefault()
  if (matches[active]) choose(matches[active].i)
})
results.addEventListener('click', (e) => {
  const li = (e.target as Element).closest<HTMLElement>('li[data-i]')
  if (li) choose(Number(li.dataset.i))
})
function choose(i: number) {
  q.value = ''
  matches = []
  renderResults()
  q.blur()
  pause()
  if (state.day < stars.birth[i]) setDay(END, { scrub: true })
  void select(i)
}

// ---------- hover, click, drag, zoom on the sky
const tip = $('#tooltip')
function hideTooltip() {
  tip.hidden = true
}
let pointer: { x: number; y: number } | null = null
let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null
let pickQueued = false
const skyEl = $('#sky')
if (sky) {
  addEventListener('pointermove', (e) => {
    sky.mouse.x = (e.clientX / innerWidth - 0.5) * 2
    sky.mouse.y = -(e.clientY / innerHeight - 0.5) * 2
  })
  skyEl.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY }
    if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y
      if (Math.hypot(dx, dy) > 5) drag.moved = true
      if (drag.moved) {
        const k = (sky.cam.z / skyEl.clientHeight) * 0.83
        sky.cam.tx = drag.cx - dx * k
        sky.cam.ty = drag.cy + dy * k
        sky.cam.x = sky.cam.tx
        sky.cam.y = sky.cam.ty
        hideTooltip()
        return
      }
    }
    if (!pickQueued) {
      pickQueued = true
      requestAnimationFrame(hover)
    }
  })
  skyEl.addEventListener('pointerleave', () => {
    pointer = null
    hideTooltip()
  })
  skyEl.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: sky.cam.tx, cy: sky.cam.ty, moved: false }
    skyEl.setPointerCapture(e.pointerId)
  })
  skyEl.addEventListener('pointerup', (e) => {
    const wasDrag = drag?.moved
    drag = null
    if (wasDrag) {
      pause()
      return
    }
    const i = sky.pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 22 : 14)
    if (i >= 0) {
      pause()
      if (stars.login[i]) void select(i)
      else showTip(i, e.clientX, e.clientY)
    } else if (state.selected != null && !$('#story').hidden === false) {
      // tap on empty sky: nothing
    }
  })
  skyEl.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      pause()
      sky.cam.tz = Math.max(0.45, Math.min(sky.baseZ * 1.4, sky.cam.tz * (1 + e.deltaY * 0.0012)))
    },
    { passive: false }
  )
}
function hover() {
  pickQueued = false
  if (!sky || !pointer || drag?.moved) return
  const i = sky.pick(pointer.x, pointer.y)
  if (i < 0) {
    hideTooltip()
    skyEl.style.cursor = ''
    return
  }
  skyEl.style.cursor = stars.login[i] ? 'pointer' : 'default'
  showTip(i, pointer.x, pointer.y)
}
function showTip(i: number, x: number, y: number) {
  const l = stars.login[i]
  const since = monthYear(stars.birth[i])
  tip.innerHTML = l
    ? `<img src="${avatar(l, 64)}" alt="" /><span><b>@${esc(l)}</b><small>${stars.kind[i] === 1 ? 'reported issues' : 'contributor'} since ${since}</small></span>`
    : `<span><b>A contributor</b><small>without a GitHub account, since ${since}</small></span>`
  tip.style.transform = `translate(${Math.min(x + 14, innerWidth - 240)}px, ${y + 14}px)`
  tip.hidden = false
}

// ---------- sound, about, keys
$('#sound').addEventListener('click', () => {
  if (sound.on) sound.disable()
  else sound.enable()
  $('#sound').setAttribute('aria-pressed', String(sound.on))
  $('#sound').setAttribute('aria-label', sound.on ? 'Turn sound off' : 'Turn sound on')
})
$('#about-btn').addEventListener('click', () => {
  pause()
  $<HTMLDialogElement>('#about').showModal()
})
addEventListener('keydown', (e) => {
  if ((e.target as Element).closest('input, textarea, dialog, #story')) return
  if (e.key === ' ' && e.target === document.body) {
    e.preventDefault()
    if (state.playing) pause()
    else play()
  }
  if (e.key === 'Escape' && state.selected != null && $('#story').hidden) deselect()
  if (e.key === '/') {
    e.preventDefault()
    q.focus()
  }
})

// ---------- personal link
const u = new URLSearchParams(location.search).get('u')
const personalIndex = u ? loginIndex.get(u.toLowerCase()) : undefined
if (personalIndex !== undefined) {
  const i = personalIndex
  state.personal = i
  sky?.select(i, [])
  addPersonalBeat(i)
  document.body.classList.add('personal')
  $('#intro h1').textContent = `This sky has a star for you, @${stars.login[i]}.`
  $('#intro p').textContent =
    'Watch it light up. Every point of light is a person who helped build ownCloud.'
}

// ---------- timeline (needs the final chapter list, incl. your own)
let scrubbing = false
let resumeAfterScrub = false
timeline = new Timeline($('#timeline'), data, {
  // the thank-you is always reachable from the end of the timeline
  chapters: [
    ...beats,
    {
      day: END,
      kind: 'finale',
      title: `Thank you, all ${fmt(totals.everyone)} of you`,
      project: -1
    }
  ],
  onScrub: (d) => {
    // remember whether the show was playing when the user grabbed the timeline
    if (!scrubbing) {
      scrubbing = true
      resumeAfterScrub = state.playing || !!state.beat
    }
    state.scrubAt = performance.now()
    skipIntro()
    pause()
    hideFinale()
    setDay(d, { scrub: true })
  },
  onScrubEnd: () => {
    scrubbing = false
    // keep playing from the new spot, unless it was paused or we're at the very end
    if (resumeAfterScrub && state.day < END) play()
    resumeAfterScrub = false
  },
  onChapter: (c) => {
    skipIntro()
    if (c.kind === 'finale') {
      pause()
      if (!$('#story').hidden) story.close()
      endBeat({ quiet: true })
      setDay(END, { scrub: true })
      sky?.home()
      showFinale()
      return
    }
    // jump straight into the chapter
    hideFinale()
    if (!$('#story').hidden) story.close()
    endBeat({ quiet: true })
    setDay(c.day, { scrub: true })
    state.speed = 0
    play()
    startBeat(c)
  }
})
timeline.canvas.setAttribute('aria-valuemax', String(END))
if (state.personal != null) {
  timeline.personal = stars.birth[state.personal]
  timeline.draw()
}

// ---------- loop
let last = performance.now()
let introDone = false
setDay(reduced || !hasGL ? END : 0, { scrub: true })
if (state.playing) document.body.classList.add('playing')
else $('#play').setAttribute('aria-label', 'Play')
const introDelay = reduced || !hasGL ? 0 : 3200
function skipIntro() {
  $('#intro').classList.add('off')
  introDone = true
}
setTimeout(skipIntro, introDelay)
if (reduced || !hasGL) {
  if (state.personal != null) void select(state.personal)
  else showFinale()
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  sound.update(dt, {
    fullness: (state.lastCode || 0) / Math.max(1, codeBirths.length),
    scrubbing: performance.now() - (state.scrubAt || 0) < 250,
    playing: state.playing || !!state.beat
  })
  if (state.playing && introDone) {
    if (state.beat) {
      state.beat.t += dt
      if (state.beat.t > (reduced ? 2.5 : HOLD_SECONDS)) endBeat()
    } else {
      const base = END / AUTOPLAY_SECONDS
      const next = beats[state.milestoneIdx]
      let target = base
      if (next && !reduced)
        target = base * Math.min(1, Math.max(0.12, (next.day - state.day) / SLOW_WINDOW))
      state.speed +=
        (target - state.speed) * (1 - Math.pow(target < state.speed ? 0.002 : 0.05, dt))
      let day = state.day + Math.max(state.speed, base * 0.03) * dt
      if (next && day >= next.day) {
        day = next.day
        state.milestoneIdx++
        setDay(day)
        startBeat(next)
      } else setDay(day)
      if (state.day >= END && !state.beat) {
        pause()
        crescendo()
      }
    }
  }
  if (sky) {
    sky.render(dt, reduced)
    placeLabels()
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
// dev only: lets you drive the show from the browser console
if (import.meta.env.DEV) {
  Object.assign(window, { __debug: { setDay, pause, play, select, state, sky, sound } })
}
