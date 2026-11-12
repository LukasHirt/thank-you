// Step 6: merge everything into the static, privacy-safe data the site loads.
//   public/data/sky.json            all stars (compact, columnar) + meta
//   public/data/people/<k>.json     per-person detail, sharded by first char of login
//   links.csv                       personal links (BASE_URL env var, default GitHub Pages URL)
// Emails never leave this script.
import fs from 'node:fs'
import path from 'node:path'
import { OUT, RAW, byCodeUnit, listRepos, readJSON, writeJSON } from './lib.ts'
import type { ApiState, CommitRecord, Extras, Identities } from './lib.ts'
import {
  PROJECTS,
  findEmail,
  isBot,
  normName,
  persona,
  projectOf,
  scrubEmails as scrub
} from './rules.ts'
import type { PersonaStats, ProjectId } from './rules.ts'
import type {
  Beat,
  ContributionType,
  PeopleShard,
  PersonDetail,
  Project,
  SkyData,
  StarKind
} from '../src/types.ts'

const repos = await listRepos()
const identities = readJSON<Identities>(path.join(RAW, 'identities.json'), {})
const extras = readJSON<Extras>(path.join(RAW, 'extras.json'), {})
const BASE_URL = process.env.BASE_URL || 'https://lukashirt.github.io/owncloud-thank-you/'

// ---------- bots & non-people: see isBot in rules.ts

// ---------- projects (constellations): see PROJECTS / projectOf in rules.ts
const PIDX: Record<string, number> = Object.fromEntries(PROJECTS.map((p, i) => [p.id, i]))
const repoProject: Record<string, ProjectId> = Object.fromEntries(
  repos.map((r) => [r.id, projectOf(r.name, r.org)])
)
const display: Record<string, string> = Object.fromEntries(repos.map((r) => [r.id, r.display]))

// ---------- identity resolution
// name -> login, only when the name maps to exactly one login
const nameLogins = new Map<string, Set<string>>()
const commitFiles = fs.readdirSync(path.join(RAW, 'commits'))
const allCommits: [repo: string, ...CommitRecord][] = []
for (const f of commitFiles) {
  const repo = f.replace(/\.json$/, '')
  for (const c of readJSON<CommitRecord[]>(path.join(RAW, 'commits', f), [])) {
    allCommits.push([repo, ...c])
    const login = identities[c[1]]
    if (login && c[2]) {
      const k = c[2].trim().toLowerCase()
      let ls = nameLogins.get(k)
      if (!ls) nameLogins.set(k, (ls = new Set()))
      ls.add(login)
    }
  }
}
// GitHub logins are case-insensitive: key by lowercase, display with the casing GitHub reports
const casing = new Map<string, string>()
const noteCasing = (l: string | null) => {
  if (l && (!casing.has(l.toLowerCase()) || casing.get(l.toLowerCase()) === l.toLowerCase()))
    casing.set(l.toLowerCase(), l)
}
Object.values(identities).forEach(noteCasing)
function personKey(email: string, name: string): string {
  const login = identities[email]
  if (login) return login.toLowerCase()
  const ls = nameLogins.get(normName(name))
  if (ls && new Set([...ls].map((l) => l.toLowerCase())).size === 1) return [...ls][0].toLowerCase()
  if (normName(name).length > 2) return `~name:${normName(name)}`
  return `~email:${email}`
}

interface FirstContribution {
  date: string
  repo: string
  type: ContributionType
  text: string | null
}
interface Person {
  key: string
  login: string | null
  names: Map<string, number>
  commits: number
  prs: number
  merged: number
  issues: number
  reviews: number
  repos: Map<string, number>
  years: Map<string, number>
  hours: number[]
  dow: number[]
  first: FirstContribution | null
  /** first contribution in the ownCloud era */
  firstOC?: string
  last: string | null
  collab: Map<string, number>
}
/** A person with at least one contribution. */
type Contributor = Person & PersonaStats & { first: FirstContribution; last: string }

const people = new Map<string, Person>() // key -> record
function person(key: string): Person {
  if (!key.startsWith('~')) key = key.toLowerCase()
  let p = people.get(key)
  if (!p) {
    p = {
      key,
      login: key.startsWith('~') ? null : casing.get(key) || key,
      names: new Map(),
      commits: 0,
      prs: 0,
      merged: 0,
      issues: 0,
      reviews: 0,
      repos: new Map(),
      years: new Map(),
      hours: Array.from({ length: 24 }, () => 0),
      dow: Array.from({ length: 7 }, () => 0),
      first: null,
      last: null,
      collab: new Map()
    }
    people.set(key, p)
  }
  return p
}
// ownCloud was announced on 2010-01-17. Older history (csync in the desktop client) is
// counted in stats, but a star is born with its first contribution in the ownCloud era.
const OC_START = '2010-01-17'
const ROOTS_BIRTH = '2011-02-17' // Mirall, the future desktop client, starts
function touch(p: Person, date: string, repo: string, type: ContributionType, text: string | null) {
  if (!p.first || date < p.first.date) p.first = { date, repo, type, text }
  if (date >= OC_START && (!p.firstOC || date < p.firstOC)) p.firstOC = date
  if (!p.last || date > p.last) p.last = date
  const y = date.slice(0, 4)
  p.years.set(y, (p.years.get(y) || 0) + 1)
  p.repos.set(repo, (p.repos.get(repo) || 0) + 1)
}

// API logins carry GitHub's real casing
for (const r of repos) {
  const st = readJSON<ApiState | null>(path.join(RAW, 'api', `${r.id}.json`), null)
  if (!st) continue
  for (const x of st.issues) noteCasing(x[0])
  for (const x of st.prs) noteCasing(x[0])
  for (const x of st.reviews) noteCasing(x[0])
}

// ---------- commits (dedupe content copied between repos)
let commitTotal = 0,
  botCommits = 0
const seenContent = new Set<string>()
const repoMonthAuthors = new Map<string, Set<string>>()
allCommits.sort((a, b) => a[4].localeCompare(b[4]))
for (const [repo, , email, name, date, subject] of allCommits) {
  const contentKey = `${email}|${date}|${subject}`
  if (seenContent.has(contentKey)) continue
  seenContent.add(contentKey)
  const key = personKey(email, name)
  if (
    isBot(name) ||
    isBot(key.replace(/^~\w+:/, '')) ||
    (email.endsWith('noreply@github.com') && !identities[email])
  ) {
    botCommits++
    continue
  }
  commitTotal++
  const p = person(key)
  p.commits++
  if (name) p.names.set(name, (p.names.get(name) || 0) + 1)
  touch(p, date, repo, 'commit', subject)
  const hour = Number(date.slice(11, 13))
  p.hours[hour]++
  p.dow[new Date(date.slice(0, 10) + 'T12:00:00Z').getUTCDay()]++
  const rm = `${repo}|${date.slice(0, 7)}`
  let authors = repoMonthAuthors.get(rm)
  if (!authors) repoMonthAuthors.set(rm, (authors = new Set()))
  authors.add(key)
}

// ---------- issues, PRs, reviews
let prTotal = 0,
  issueTotal = 0,
  reviewTotal = 0
const apiDir = path.join(RAW, 'api')
const apiMissing: string[] = []
for (const r of repos) {
  const st = readJSON<ApiState | null>(path.join(apiDir, `${r.id}.json`), null)
  if (!st || !st.issuesDone || !st.prsDone) apiMissing.push(r.full)
  if (!st) continue
  for (const [login, date, , title] of st.issues) {
    if (!login || isBot(login)) continue
    issueTotal++
    const p = person(login)
    p.issues++
    touch(p, date, r.id, 'issue', title)
  }
  for (const [login, date, mergedAt, , title] of st.prs) {
    if (!login || isBot(login)) continue
    prTotal++
    const p = person(login)
    p.prs++
    if (mergedAt) p.merged++
    touch(p, date, r.id, 'pr', title)
  }
  for (const [login, date, prAuthor] of st.reviews) {
    if (!login || isBot(login) || login === prAuthor) continue
    reviewTotal++
    const p = person(login)
    p.reviews++
    touch(p, date, r.id, 'review', null)
    if (prAuthor && !isBot(prAuthor)) {
      const q = person(prAuthor)
      p.collab.set(q.key, (p.collab.get(q.key) || 0) + 3)
      q.collab.set(p.key, (q.collab.get(p.key) || 0) + 3)
    }
  }
}
// co-working in the same repo in the same month (small teams weigh more)
for (const set of repoMonthAuthors.values()) {
  if (set.size < 2 || set.size > 25) continue
  const w = 2 / set.size
  for (const a of set)
    for (const b of set)
      if (a !== b) {
        const p = people.get(a)
        if (!p) continue
        p.collab.set(b, (p.collab.get(b) || 0) + w)
      }
}

// ---------- drop anything that isn't a real, identifiable person
const contributors = [...people.values()].filter(
  (p): p is Contributor => p.first !== null && p.last !== null
)

// ---------- persona (always kind): see persona in rules.ts

// ---------- assemble
const DAY0 = Date.UTC(2010, 0, 1)
const dayOf = (iso: string) =>
  Math.max(0, Math.round((Date.parse(iso.slice(0, 10) + 'T00:00:00Z') - DAY0) / 86400000))
interface Entry {
  p: Contributor
  kind: StarKind
  project: number
  weight: number
  birth: number
  activeYears: number[]
}
const list = contributors.map((p): Entry => {
  const code = p.commits + p.prs + p.reviews
  const kind: StarKind = !p.login ? 2 : code > 0 ? 0 : 1 // 0 star, 1 stardust (issues only), 2 no GitHub account
  // opt-outs are applied afterwards by apply-optout.ts (also in CI)
  const projScore = Array.from({ length: PROJECTS.length }, () => 0)
  for (const [repo, n] of p.repos) projScore[PIDX[repoProject[repo] || 'server']] += n
  const project = projScore.indexOf(Math.max(...projScore))
  const weight = Math.log2(1 + p.commits + 2 * p.prs + p.reviews + 0.5 * p.issues)
  return {
    p,
    kind,
    project,
    weight,
    birth: dayOf(p.firstOC || ROOTS_BIRTH),
    activeYears: [...p.years.keys()].map(Number).filter((y) => y >= 2010)
  }
})
list.sort((a, b) => a.birth - b.birth || b.weight - a.weight)
const indexOfKey = new Map(list.map((x, i) => [x.p.key, i]))

// layout: each project a cluster; stars spiral outward by weight rank within cluster
const hash = (s: string) => {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967296
}
// server sits in the middle; the other projects orbit it
const ANGLES: Record<string, number> = {
  ocis: 24,
  web: -24,
  docs: -78,
  desktop: -132,
  infra: 172,
  android: 126,
  ios: 78
}
const CENTERS = PROJECTS.map((p): Project['center'] =>
  p.id === 'server'
    ? [0, 0]
    : [
        1.32 * Math.cos((ANGLES[p.id] * Math.PI) / 180),
        0.86 * Math.sin((ANGLES[p.id] * Math.PI) / 180)
      ]
)
const RADII: number[] = []
const byProject = PROJECTS.map((): number[] => [])
list.forEach((x, i) => byProject[x.project].push(i))
const pos: [number, number, number][] = [] // every index is filled below
byProject.forEach((idxs, pi) => {
  const ranked = [...idxs].sort((a, b) => list[b].weight - list[a].weight)
  const spread = Math.min(0.62, 0.14 + 0.03 * Math.sqrt(ranked.length / 10))
  RADII[pi] = spread
  ranked.forEach((i, rank) => {
    const h1 = hash(list[i].p.key),
      h2 = hash(list[i].p.key + 'y'),
      h3 = hash(list[i].p.key + 'z')
    const r = spread * (0.1 + 0.9 * Math.sqrt((rank + 0.5) / ranked.length)) * (0.75 + 0.5 * h1)
    const a = rank * 2.39996 + h2 * 0.6 // golden angle
    pos[i] = [
      CENTERS[pi][0] + r * Math.cos(a) * 1.15,
      CENTERS[pi][1] + r * Math.sin(a),
      (h3 - 0.5) * 0.9 * (0.4 + (0.6 * r) / spread)
    ]
  })
})

// constellation lines: chain the brightest stars of each project via nearest neighbours
const constellations = byProject.map((idxs): number[] => {
  const top = [...idxs]
    .filter((i) => list[i].kind === 0)
    .sort((a, b) => list[b].weight - list[a].weight)
    .slice(0, 9)
  if (top.length < 2) return []
  const edges: number[] = [],
    inTree = new Set([top[0]])
  while (inTree.size < top.length) {
    let best: [number, number, number] | null = null
    for (const a of inTree)
      for (const b of top)
        if (!inTree.has(b)) {
          const d = Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1])
          if (!best || d < best[2]) best = [a, b, d]
        }
    if (!best) break // unreachable: some star is always left outside the tree
    edges.push(best[0], best[1])
    inTree.add(best[1])
  }
  return edges
})

const r4 = (v: number) => Math.round(v * 10000) / 10000
const people_ = list.map((x) => (x.kind === 2 ? null : x.p.login))
const firstYear = 2010

// milestones: first contribution day of key projects + a few curated facts
const firstDayOfRepo = new Map<string, string>()
for (const [repo, , , , date] of allCommits)
  if (!firstDayOfRepo.has(repo) && date >= OC_START) firstDayOfRepo.set(repo, date)
firstDayOfRepo.set('client', ROOTS_BIRTH)
// Chapters ("beats"): the show slows down and holds on each of these.
// Kept neutral on purpose: no individual is singled out as a founder.
const MILESTONE_REPOS: Record<string, [title: string, sub: string]> = {
  core: [
    'The first lines of ownCloud Server',
    'A few people, a simple idea: your files, on your own server.'
  ],
  client: ['The desktop client is born', 'Sync arrives on Linux, macOS and Windows.'],
  android: ['ownCloud lands on Android', 'Your files go mobile.'],
  docs: ['Documentation finds a home', 'Knowledge, written down for everyone who comes next.'],
  'ios-legacy': ['ownCloud arrives on iOS', 'iPhone and iPad join the sky.'],
  web: ['A new web interface begins', 'A fresh start for the browser, later simply called Web.'],
  ocis: ['Infinite Scale', 'A new beginning, written in Go.']
}
const beats: Beat[] = Object.entries(MILESTONE_REPOS).flatMap(([r, [title, sub]]): Beat[] => {
  const first = firstDayOfRepo.get(r)
  return first
    ? [{ day: dayOf(first), kind: 'project', title, sub, project: PIDX[repoProject[r]] }]
    : []
})
beats.push({
  day: dayOf('2010-01-17'),
  kind: 'announce',
  title: 'ownCloud is announced',
  sub: 'Somewhere, a first point of light.',
  project: 0
})
beats.push({
  day: dayOf('2023-11-14'),
  kind: 'project',
  title: 'ownCloud joins Kiteworks',
  sub: 'A new home, and the sky keeps growing.',
  project: 1
})
// the Nth person to contribute code
let codeCount = 0
const codeTotal = list.filter((x) => x.kind !== 1).length
const COUNT_BEATS = new Set([100, 1000, Math.floor(codeTotal / 500) * 500].filter((n) => n > 1000))
COUNT_BEATS.add(100)
COUNT_BEATS.add(1000)
// counts everyone with code contributions (commits, PRs, reviews), named or not:
// the same definition as the live counter on the page
list.forEach((x, i) => {
  if (x.kind === 1) return
  codeCount++
  if (COUNT_BEATS.has(codeCount))
    beats.push({
      day: x.birth,
      kind: 'count',
      n: codeCount,
      star: i,
      title: `Contributor number ${codeCount.toLocaleString('en')}`,
      sub:
        x.kind === 0
          ? `@${x.p.login} joins the sky.`
          : 'A contributor without a GitHub account joins the sky.',
      project: x.project
    })
})
// the year the most people arrived
const perYear = new Map<number, number>()
list.forEach((x) => {
  const y = new Date(DAY0 + x.birth * 86400000).getUTCFullYear()
  perYear.set(y, (perYear.get(y) || 0) + 1)
})
const [peakYear, peakCount] = [...perYear].sort((a, b) => b[1] - a[1])[0]
beats.push({
  day: dayOf(`${peakYear}-12-20`),
  kind: 'peak',
  title: 'The brightest year',
  sub: `${peakCount.toLocaleString('en')} people found their way to ownCloud in ${peakYear} alone.`,
  project: -1,
  year: peakYear
})
// two beats too close together feel rushed: keep the earlier one
beats.sort((a, b) => a.day - b.day)
const milestones = beats.filter(
  (b, k) => k === 0 || b.day - beats[k - 1].day > 60 || b.kind === 'count'
)

// a constellation gets its name once its project has real history: the earliest first
// commit among its active repos (ignoring tiny repos that would date it misleadingly)
const repoCommitCount = new Map<string, number>()
for (const [repo] of allCommits) repoCommitCount.set(repo, (repoCommitCount.get(repo) || 0) + 1)
const projectSince = PROJECTS.map((p) => {
  const days = [...firstDayOfRepo]
    .filter(([r]) => repoProject[r] === p.id && (repoCommitCount.get(r) || 0) >= 300)
    .map(([, d]) => dayOf(d))
  return days.length ? Math.min(...days) : 0
})
const named = list.filter((x) => x.kind !== 2).length
const sky: SkyData = {
  generatedAt: new Date().toISOString(),
  day0: '2010-01-01',
  today: dayOf(new Date().toISOString()),
  projects: PROJECTS.map((p, i): Project => ({
    ...p,
    center: [r4(CENTERS[i][0]), r4(CENTERS[i][1])],
    radius: r4(RADII[i] || 0.1),
    since: projectSince[i]
  })),
  totals: {
    people: list.filter((x) => x.kind !== 1).length,
    stardust: list.filter((x) => x.kind === 1).length,
    everyone: list.length,
    named,
    commits: commitTotal,
    prs: prTotal,
    issues: issueTotal,
    reviews: reviewTotal,
    repos: repos.length,
    firstYear,
    languages: (extras.languages || []).length,
    dockerPulls: extras.dockerPulls?.total || 0,
    dockerPullsDate: extras.dockerPulls?.date,
    botCommits
  },
  milestones,
  releases: (extras.releases || []).map((r) => ({
    day: dayOf(r.date),
    label: `${r.label} ${r.version}`,
    project: PIDX[repoProject[r.repo]]
  })),
  stars: {
    login: people_,
    birth: list.map((x) => x.birth),
    project: list.map((x) => x.project),
    kind: list.map((x) => x.kind),
    weight: list.map((x) => r4(x.weight)),
    pos: list.flatMap((_, i) => pos[i].map(r4)),
    active: list.map((x) => x.activeYears.reduce((m, y) => m | (1 << (y - 2010)), 0))
  },
  constellations
}
fs.rmSync(path.join(OUT, 'people'), { recursive: true, force: true })
writeJSON(path.join(OUT, 'sky.json'), sky)

// per-person detail
const shards = new Map<string, PeopleShard>()
list.forEach((x, i) => {
  const p = x.p
  const login = p.login
  if (x.kind === 2 || !login) return
  const collab = [...p.collab]
    .flatMap(([k, w]): [number, number][] => {
      const j = indexOfKey.get(k)
      return j !== undefined && list[j].kind !== 2 ? [[j, w]] : []
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([j]) => j)
  const topRepos = [...p.repos].sort((a, b) => b[1] - a[1])
  const totalTouches = topRepos.reduce((a, [, n]) => a + n, 0)
  const years = Object.fromEntries([...p.years].sort((a, b) => byCodeUnit(a[0], b[0])))
  const busiest = Object.entries(years).sort((a, b) => b[1] - a[1])[0]
  const detail: PersonDetail = {
    i,
    login,
    born: new Date(DAY0 + x.birth * 86400000).toISOString().slice(0, 10),
    first: {
      date: p.first.date.slice(0, 10),
      repo: display[p.first.repo] || p.first.repo,
      type: p.first.type,
      text: scrub(p.first.text)
    },
    last: p.last.slice(0, 10),
    totals: {
      commits: p.commits,
      prs: p.prs,
      merged: p.merged,
      issues: p.issues,
      reviews: p.reviews,
      repos: p.repos.size
    },
    repos: topRepos
      .slice(0, 5)
      .map(([r, n]) => [display[r] || r, Math.round((100 * n) / totalTouches)]),
    years,
    busiest: busiest ? { year: Number(busiest[0]), count: busiest[1] } : null,
    hours: p.hours,
    collab,
    persona: persona(p)
  }
  const shardName = login[0].toLowerCase().replace(/[^a-z0-9]/, '_')
  let shard = shards.get(shardName)
  if (!shard) shards.set(shardName, (shard = {}))
  shard[login.toLowerCase()] = detail
})
for (const [k, v] of shards) writeJSON(path.join(OUT, 'people', `${k}.json`), v)

// personal links for the owner (not published by the site)
const csv = [
  'login,name,url',
  ...list.flatMap((x) => {
    const login = x.p.login
    if (x.kind === 2 || !login) return []
    const name = ([...x.p.names].sort((a, b) => b[1] - a[1])[0]?.[0] || '').replace(/"/g, '')
    return [`${login},"${name}",${BASE_URL}?u=${encodeURIComponent(login)}`]
  })
]
fs.writeFileSync(path.join(RAW, 'links.csv'), csv.join('\n') + '\n')

const size = fs.statSync(path.join(OUT, 'sky.json')).size
console.log(JSON.stringify(sky.totals, null, 1))
console.log(`sky.json ${(size / 1024).toFixed(0)} KB, ${shards.size} shards, ${list.length} points`)
if (apiMissing.length)
  console.log(
    `WARNING: API data incomplete for ${apiMissing.length} repos (re-run after data:api finishes)`
  )
// privacy guard: no email may ever be written
for (const f of [
  path.join(OUT, 'sky.json'),
  ...fs.readdirSync(path.join(OUT, 'people')).map((f) => path.join(OUT, 'people', f))
]) {
  const leak = findEmail(fs.readFileSync(f, 'utf8'))
  if (leak) throw new Error(`email-like string found in ${f}: ${leak}`)
}
console.log('privacy check passed: no email addresses in output; links.csv written to raw/')
