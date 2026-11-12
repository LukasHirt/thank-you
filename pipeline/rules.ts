// Pure rules of the data pipeline: no file system, no network. Imported by the
// pipeline scripts and covered by tests/pipeline.
import type { PeopleShard, SkyData } from '../src/types.ts'

// ---------- bots & non-people

const BOT_RE =
  /(\[bot\]$|\bbot\b|-bot$|^bot-|^jenkins|jenkins for owncloud|^ownclouders?$|transifex|^ghost$|codesign|^drone|github-actions|renovate|dependabot|weblate|^owncloud-ci|^owncloudci|^ci$|^translations?$|^l10n|^autobuild|^semantic-release|snyk|imgbot|greenkeeper|^web-flow$|^root$|^localhost$|^admin$)/i

/** True for bots, CI accounts and other non-people. An empty or missing name counts as a bot. */
export function isBot(name: string | null | undefined): boolean {
  return !name || BOT_RE.test(name)
}

// ---------- projects (constellations)

export const PROJECTS = [
  { id: 'server', name: 'ownCloud Server', color: '#6fa8ff' },
  { id: 'ocis', name: 'Infinite Scale', color: '#5ee7c4' },
  { id: 'web', name: 'Web', color: '#c79bff' },
  { id: 'desktop', name: 'Desktop', color: '#ffb86b' },
  { id: 'android', name: 'Android', color: '#9be36b' },
  { id: 'ios', name: 'iOS', color: '#ff8fb1' },
  { id: 'docs', name: 'Docs & Community', color: '#ffe27a' },
  { id: 'infra', name: 'Infrastructure & QA', color: '#9fb4c8' }
] as const

export type ProjectId = (typeof PROJECTS)[number]['id']

/** Which project (constellation) a repository belongs to. Everything in owncloud-docker is infrastructure. */
export function projectOf(name: string, org = 'owncloud'): ProjectId {
  if (org === 'owncloud-docker') return 'infra'
  const n = name.toLowerCase()
  if (
    /^(docs|owncloud\.github\.io|community|awesome-ocis|screenshots|product|gh-labels|\.github|assets|example-files|theme-example|security-advisories)/.test(
      n
    )
  )
    return 'docs'
  if (/^(android|dav4android)/.test(n)) return 'android'
  if (/^(ios|notes-ios|news-ios|tvos)/.test(n)) return 'ios'
  if (
    /^(client|craft|libcrashreporter|owncloud-client|zsync|libre-graph-api-cpp|ocsign|smashbox|owncloud-updater|developer-certificates|owncloudu)/.test(
      n
    )
  )
    return 'desktop'
  if (
    /^(web|owncloud-design-system|file-picker|owncloud-sdk|easygettext|uppy|drawio|ocis-phoenix|libre-graph-api-typescript)/.test(
      n
    )
  )
    return 'web'
  if (
    /^(ocis|reva|revaold|cs3|boilr|cdperf|flaex|protoc-gen|libre-graph|graph-explorer|moodle|migrate_to_ocis|helm|protocol|conan)/.test(
      n
    )
  )
    return 'ocis'
  if (
    /^(qa|testing|test-data|litmus|update-testing|administration|appliance|qnap|reusable-workflows|ownbuild|actions|translation-sync|health-check|owncloud-test-middleware|config-to-docs|coding-standard|marketplace|appstore|download\.owncloud|marketo)/.test(
      n
    )
  )
    return 'infra'
  return 'server'
}

// ---------- names

/** Commit author names are compared trimmed and case-insensitively. */
export function normName(name: string | null | undefined): string {
  return (name || '').trim().toLowerCase()
}

// ---------- persona (always kind)

/** What `persona` needs to know about a person. */
export interface PersonaStats {
  commits: number
  prs: number
  issues: number
  reviews: number
  /** contributions per hour of day (0-23) */
  hours: readonly number[]
  /** contributions per day of week (0 = Sunday) */
  dow: readonly number[]
  /** contributions per year */
  years: ReadonlyMap<string, number>
  /** contributions per repository */
  repos: ReadonlyMap<string, number>
  first: { date: string }
  last: string
}

export type Persona = [title: string, text: string]

export function persona(p: PersonaStats): Persona {
  const total = p.hours.reduce((a, b) => a + b, 0)
  const share = (hs: number[]) => (total ? hs.reduce((a, h) => a + p.hours[h], 0) / total : 0)
  const weekend = total ? (p.dow[0] + p.dow[6]) / total : 0
  const yearsActive = p.years.size
  const span = Number(p.last.slice(0, 4)) - Number(p.first.date.slice(0, 4))
  if (p.commits + p.prs + p.reviews + p.issues <= 2)
    return [
      'The Spark',
      'Every constellation starts with a single point of light. Yours is part of this sky forever.'
    ]
  if (span >= 8)
    return ['The Long Hauler', `Over ${span} years with ownCloud. Some stars just keep shining.`]
  if (total >= 30 && share([22, 23, 0, 1, 2, 3, 4]) > 0.3)
    return [
      'The Night Owl',
      'A good share of your commits arrived after 10 pm. The stars kept you company.'
    ]
  if (total >= 30 && share([5, 6, 7, 8]) > 0.25)
    return ['The Early Bird', 'You often shipped before most people had their first coffee.']
  if (total >= 30 && weekend > 0.3)
    return ['The Weekend Hero', 'Saturdays and Sundays were part of your ownCloud story.']
  if (p.reviews >= 30 && p.reviews > 1.5 * (p.prs + p.commits / 5))
    return [
      'The Guardian',
      'You reviewed other people’s work again and again, helping everyone ship better code.'
    ]
  if (p.issues >= 15 && p.issues > p.commits + p.prs)
    return ['The Bug Hunter', 'You found what others missed and made sure it got fixed.']
  if (p.repos.size >= 8)
    return ['The Explorer', `You left your mark across ${p.repos.size} different repositories.`]
  if (yearsActive >= 4)
    return [
      'The Steady Light',
      `Active in ${yearsActive} different years. Reliable, like a star you can navigate by.`
    ]
  return ['The Builder', 'You rolled up your sleeves and helped build ownCloud.']
}

// ---------- privacy

/** Anything that looks like an email address. Global: use with `replace` / `match`, not `test`. */
export const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g

/** Replaces email-like strings with an ellipsis. */
export function scrubEmails<T extends string | null | undefined>(text: T): T {
  return (text ? text.replace(EMAIL_RE, '…') : text) as T
}

/** The first email-like string in `text`, or null. Used by the privacy check on the output. */
export function findEmail(text: string): string | null {
  return text.match(EMAIL_RE)?.[0] ?? null
}

// ---------- languages

/** Base language of a locale code: `pt_BR`, `pt-rBR`, `sr@latin` -> `pt`, `pt`, `sr`. */
export function langBase(code: string): string {
  return code.split(/[_\-@]/)[0].toLowerCase()
}

// ---------- releases

/** Parses a final release tag (`v2.0`, `oC4.0`, `release-3.0.0`, `10.0`); null for anything else (pre-releases, patches). */
export function parseReleaseTag(tag: string): { major: number; minor: number } | null {
  const m = tag.match(/^(?:v|oC|release-)?(\d+)\.(\d+)(?:\.0)?$/i)
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null
}

/** Major releases (X.0) from `[tag, isoDate]` pairs, oldest first. Stray tags that go backwards are ignored. */
export function majorReleases(
  tags: readonly (readonly [tag: string, date?: string])[]
): { version: string; date: string }[] {
  const sorted = [...tags].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''))
  const seen = new Set<string>()
  const out: { version: string; date: string }[] = []
  let maxMajor = -1
  for (const [tag, date] of sorted) {
    if (!date) continue
    const v = parseReleaseTag(tag)
    if (!v) continue
    // shooting stars are major releases only; ignore stray tags that go backwards
    if (v.minor !== 0 || v.major <= maxMajor) continue
    maxMajor = v.major
    const version = `${v.major}.0`
    if (seen.has(version)) continue
    seen.add(version)
    out.push({ version, date: date.slice(0, 10) })
  }
  return out
}

// ---------- opt-out

/** Handles listed in optout.txt: lowercase, without `@`, comments and blank lines dropped. */
export function parseOptout(text: string): Set<string> {
  return new Set(
    text
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean)
  )
}

export const ANONYMOUS_COUNT_SUB = 'A contributor joins the sky.'

export interface OptoutResult {
  sky: SkyData
  shards: Record<string, PeopleShard>
  /** stars made anonymous in this run */
  hidden: number
  /** names of the shards that changed */
  changed: string[]
}

/**
 * Makes the listed handles anonymous: the star stays (so totals don't change) but loses
 * its login, its personal story and its mention in "contributor number N" chapters.
 * Does not modify its arguments. Idempotent.
 */
export function applyOptout(
  sky: SkyData,
  shards: Record<string, PeopleShard>,
  handles: ReadonlySet<string>
): OptoutResult {
  const out = structuredClone(sky)
  let hidden = 0
  out.stars.login.forEach((l, i) => {
    if (!l || !handles.has(l.toLowerCase())) return
    out.stars.login[i] = null
    hidden++
    for (const b of out.milestones) {
      if (b.star === i && b.kind === 'count') b.sub = ANONYMOUS_COUNT_SUB
    }
  })
  const outShards: Record<string, PeopleShard> = {}
  const changed: string[] = []
  for (const [name, shard] of Object.entries(shards)) {
    const hit = Object.keys(shard).filter((k) => handles.has(k))
    if (!hit.length) {
      outShards[name] = shard
      continue
    }
    const copy = { ...shard }
    for (const h of hit) delete copy[h]
    outShards[name] = copy
    changed.push(name)
  }
  return { sky: out, shards: outShards, hidden, changed }
}
