// Shapes of the published data (public/data). Written by pipeline/06-build.ts,
// read by the site. Keep both sides in sync through these types.

/** 0 = code contributor, 1 = issue reporter ("stardust"), 2 = no GitHub account */
export type StarKind = 0 | 1 | 2

export interface Project {
  id: string
  name: string
  color: string
  center: [number, number]
  radius: number
  /** day the constellation gets its name */
  since: number
}

export type BeatKind = 'announce' | 'project' | 'count' | 'peak' | 'you' | 'finale'

/** A chapter of the story: the show slows down and holds on it. */
export interface Beat {
  day: number
  kind: BeatKind
  title: string
  sub?: string
  /** project index, -1 = the whole sky */
  project: number
  /** star index for person chapters */
  star?: number
  /** n-th contributor for count chapters */
  n?: number
  /** the year for the "brightest year" chapter */
  year?: number
}

export interface Release {
  day: number
  label: string
  project: number
}

export interface Totals {
  people: number
  stardust: number
  everyone: number
  named: number
  commits: number
  prs: number
  issues: number
  reviews: number
  repos: number
  firstYear: number
  languages: number
  dockerPulls: number
  dockerPullsDate?: string
  botCommits: number
}

/** Columnar star data: index i is the same person in every array. */
export interface Stars {
  login: (string | null)[]
  /** days since 2010-01-01 */
  birth: number[]
  project: number[]
  kind: StarKind[]
  weight: number[]
  /** x, y, z per star */
  pos: number[]
  /** bit k set = active in year 2010 + k */
  active: number[]
}

export interface SkyData {
  generatedAt: string
  day0: string
  today: number
  projects: Project[]
  totals: Totals
  milestones: Beat[]
  releases: Release[]
  stars: Stars
  /** per project: pairs of star indices */
  constellations: number[][]
}

export type ContributionType = 'commit' | 'pr' | 'issue' | 'review'

/** One person's story (public/data/people/<shard>.json, keyed by lowercase login). */
export interface PersonDetail {
  i: number
  login: string
  born: string
  first: { date: string; repo: string; type: ContributionType; text: string | null }
  last: string
  totals: {
    commits: number
    prs: number
    merged: number
    issues: number
    reviews: number
    repos: number
  }
  repos: [string, number][]
  years: Record<string, number>
  busiest: { year: number; count: number } | null
  hours: number[]
  collab: number[]
  persona: [string, string]
}

export type PeopleShard = Record<string, PersonDetail>
