// Shared helpers for the data pipeline.
import { execFileSync, spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Organizations whose PUBLIC repositories are included. Private repos are never listed.
export const ORGS = ['owncloud', 'owncloud-docker']
export const ORG = ORGS[0]

// ---------- shapes of the raw (never published) data

/** A public repository as listed by `listRepos` (raw/repos.json). */
export interface Repo {
  name: string
  isArchived: boolean
  isFork: boolean
  isPrivate: boolean
  createdAt: string
  pushedAt: string | null
  description: string | null
  stargazerCount: number
  primaryLanguage: { name: string } | null
  parent: { nameWithOwner: string } | null
  defaultBranchRef: { name: string } | null
  /** GitHub organization */
  org: string
  /** file-safe identifier (plain name for the main org) */
  id: string
  /** org/name */
  full: string
  /** what people see */
  display: string
}

/** raw/commits/<repo>.json entries: [sha, lowercase email, author name, ISO date, subject] */
export type CommitRecord = [sha: string, email: string, name: string, date: string, subject: string]
/** [author login, createdAt, number, title] */
export type IssueRecord = [login: string | null, createdAt: string, number: number, title: string]
/** [author login, createdAt, mergedAt, number, title] */
export type PrRecord = [
  login: string | null,
  createdAt: string,
  mergedAt: string | null,
  number: number,
  title: string
]
/** [reviewer login, submittedAt, PR author login, PR number, state] */
export type ReviewRecord = [
  login: string | null,
  submittedAt: string,
  prAuthor: string | null,
  number: number,
  state: string
]

/** raw/api/<repo>.json: resumable issue/PR/review collection state. */
export interface ApiState {
  issues: IssueRecord[]
  prs: PrRecord[]
  reviews: ReviewRecord[]
  issueCursor: string | null
  prCursor: string | null
  issuesDone: boolean
  prsDone: boolean
}

/** raw/identities.json: commit email -> GitHub login (null = no account found) */
export type Identities = Record<string, string | null>

export interface ReleaseRecord {
  repo: string
  label: string
  version: string
  date: string
}

/** raw/extras.json */
export interface Extras {
  dockerPulls?: { date: string; total: number; images: Record<string, number> }
  releases?: ReleaseRecord[]
  languages?: string[]
}

/** pipeline/docker-pulls-history.json entries */
export interface PullSnapshot {
  date: string
  pulls: Record<string, number>
}

/** Strict code-unit comparison, the same order as `Array.prototype.sort()` without a comparator for strings. */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const RAW = path.join(ROOT, 'raw')
export const OUT = path.join(ROOT, 'public', 'data')

export function token(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
}

export function readJSON<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJSON(file: string, data: unknown, pretty = false): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data))
  fs.renameSync(tmp, file)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface GqlResponse<T> {
  data?: T
  errors?: unknown[]
}

/** GitHub GraphQL with retry + rate-limit awareness. */
/** Partial data comes back with `__errors` when GitHub reports errors alongside it. */
export async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T & { __errors?: unknown[] }> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `bearer ${token()}`,
          'Content-Type': 'application/json',
          'User-Agent': 'owncloud-thank-you'
        },
        body: JSON.stringify({ query, variables })
      })
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } }
      console.warn(`  gql network error (${err.cause?.code || err.message}), retry ${attempt}`)
      await sleep(Math.min(60000, 2000 * 2 ** attempt))
      continue
    }
    const remaining = Number(res.headers.get('x-ratelimit-remaining'))
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      const wait =
        remaining === 0 && reset
          ? reset * 1000 - Date.now() + 2000
          : Math.min(60000, 2000 * 2 ** attempt)
      console.warn(`  gql ${res.status}, waiting ${Math.round(wait / 1000)}s`)
      await sleep(Math.max(wait, 1000))
      continue
    }
    const json = (await res.json()) as GqlResponse<T>
    if (json.errors?.length) {
      const msg = JSON.stringify(json.errors).slice(0, 400)
      if (/RATE_LIMITED|timeout|Something went wrong/i.test(msg) && attempt < 8) {
        console.warn(`  gql error, retrying: ${msg}`)
        await sleep(Math.min(60000, 3000 * 2 ** attempt))
        continue
      }
      if (json.data) return { ...json.data, __errors: json.errors }
      throw new Error(msg)
    }
    if (remaining < 50 && reset) {
      const wait = reset * 1000 - Date.now() + 2000
      console.warn(`  rate limit low, sleeping ${Math.round(wait / 1000)}s`)
      await sleep(Math.max(wait, 0))
    }
    return json.data as T & { __errors?: unknown[] }
  }
}

export async function rest(
  url: string
): Promise<{ status: number; headers: Headers; body: unknown }> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url.startsWith('http') ? url : `https://api.github.com/${url}`, {
        headers: {
          Authorization: `bearer ${token()}`,
          'User-Agent': 'owncloud-thank-you',
          Accept: 'application/vnd.github+json'
        }
      })
    } catch {
      await sleep(Math.min(60000, 2000 * 2 ** attempt))
      continue
    }
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      await sleep(Math.min(60000, 2000 * 2 ** attempt))
      continue
    }
    return {
      status: res.status,
      headers: res.headers,
      body: res.status === 204 ? null : await res.json()
    }
  }
}

/** Run async tasks with a concurrency limit. */
export async function pool<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<unknown>
): Promise<void> {
  let i = 0
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
}

/** `maxBuffer` is accepted for call-site documentation only: output is streamed, so it has no effect. */
export function run(
  cmd: string,
  args: string[],
  opts: SpawnOptions & { maxBuffer?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    let out = '',
      err = ''
    p.stdout?.on('data', (d: Buffer) => (out += d))
    p.stderr?.on('data', (d: Buffer) => (err += d))
    p.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${cmd} ${args.join(' ')} -> ${code}: ${err.slice(-500)}`))
    )
  })
}

type RepoNode = Omit<Repo, 'org' | 'id' | 'full' | 'display'>
interface RepoPage {
  organization: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: RepoNode[]
    }
  }
}

/** List every PUBLIC repository of the orgs (incl. archived + forks). Cached.
 *  id = file-safe identifier (plain name for the main org), full = org/name, display = what people see. */
export async function listRepos({ refresh = false } = {}): Promise<Repo[]> {
  const file = path.join(RAW, 'repos.json')
  const cached = readJSON<Repo[] | null>(file, null)
  if (!refresh && cached?.[0]?.id) return cached
  const repos: Repo[] = []
  for (const org of ORGS) {
    let cursor: string | null = null
    do {
      const d: RepoPage = await gql<RepoPage>(
        `query($c:String){organization(login:"${org}"){repositories(first:100,after:$c,privacy:PUBLIC){pageInfo{hasNextPage endCursor}
      nodes{name isArchived isFork isPrivate createdAt pushedAt description stargazerCount primaryLanguage{name}
      parent{nameWithOwner} defaultBranchRef{name}}}}}`,
        { c: cursor }
      )
      const r = d.organization.repositories
      for (const n of r.nodes) {
        if (n.isPrivate) continue // belt and braces: never include private repositories
        const id = org === ORG ? n.name : `${org}__${n.name}`
        repos.push({
          ...n,
          org,
          id,
          full: `${org}/${n.name}`,
          display: org === ORG ? n.name : `${org}/${n.name}`
        })
      }
      cursor = r.pageInfo.hasNextPage ? r.pageInfo.endCursor : null
    } while (cursor)
  }
  writeJSON(file, repos, true)
  return repos
}
