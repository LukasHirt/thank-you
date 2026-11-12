import { describe, expect, it } from 'vite-plus/test'
import {
  EMAIL_RE,
  findEmail,
  isBot,
  normName,
  persona,
  projectOf,
  scrubEmails
} from '../../pipeline/rules.ts'
import type { PersonaStats } from '../../pipeline/rules.ts'

describe('isBot', () => {
  it.each([
    'dependabot[bot]',
    'owncloud-codesign-bot[bot]',
    'Jenkins for ownCloud',
    'ownClouders',
    'ownclouder',
    'ghost',
    'Renovate Bot',
    'snyk-bot',
    'owncloud-bot',
    'github-actions',
    'Drone CI',
    'root'
  ])('treats %s as a bot', (name) => {
    expect(isBot(name)).toBe(true)
  })

  it.each([
    'LukasHirt',
    'phil-davis',
    'abbott',
    'Abbott Smith',
    'robot-arm',
    'botanist',
    'ghostwriter'
  ])('treats %s as a person', (name) => {
    expect(isBot(name)).toBe(false)
  })

  it('treats missing names as bots', () => {
    expect(isBot('')).toBe(true)
    expect(isBot(null)).toBe(true)
    expect(isBot(undefined)).toBe(true)
  })
})

describe('projectOf', () => {
  it.each([
    ['core', 'server'],
    ['user_ldap', 'server'],
    ['ocis', 'ocis'],
    ['reva', 'ocis'],
    ['web', 'web'],
    ['owncloud-sdk', 'web'],
    ['client', 'desktop'],
    ['android', 'android'],
    ['dav4android', 'android'],
    ['ios-app', 'ios'],
    ['ios-legacy', 'ios'],
    ['docs-server', 'docs'],
    ['owncloud.github.io', 'docs'],
    ['qa-tools', 'infra']
  ] as const)('%s -> %s', (name, project) => {
    expect(projectOf(name)).toBe(project)
  })

  it('ignores case', () => {
    expect(projectOf('Android-Library')).toBe('android')
  })

  it('puts every owncloud-docker repository into infra', () => {
    expect(projectOf('server', 'owncloud-docker')).toBe('infra')
    expect(projectOf('ocis', 'owncloud-docker')).toBe('infra')
    expect(projectOf('base', 'owncloud-docker')).toBe('infra')
  })
})

describe('normName', () => {
  it('trims and lowercases', () => {
    expect(normName('  Lukas Hirt ')).toBe('lukas hirt')
  })
  it('handles missing names', () => {
    expect(normName(null)).toBe('')
    expect(normName(undefined)).toBe('')
  })
})

/** A person with a single commit at noon on a Wednesday in 2020. */
function stats(over: Partial<PersonaStats> = {}): PersonaStats {
  const hours = Array.from({ length: 24 }, () => 0)
  hours[12] = 1
  const dow = Array.from({ length: 7 }, () => 0)
  dow[3] = 1
  return {
    commits: 1,
    prs: 0,
    issues: 0,
    reviews: 0,
    hours,
    dow,
    years: new Map([['2020', 1]]),
    repos: new Map([['core', 1]]),
    first: { date: '2020-05-01T12:00:00Z' },
    last: '2020-05-01T12:00:00Z',
    ...over
  }
}

/** `n` contributions spread over the given hours (round robin), on weekdays. */
function hoursOf(n: number, at: number[]): number[] {
  const hours = Array.from({ length: 24 }, () => 0)
  for (let i = 0; i < n; i++) hours[at[i % at.length]]++
  return hours
}

describe('persona', () => {
  it('calls one or two contributions The Spark', () => {
    expect(persona(stats())[0]).toBe('The Spark')
    expect(persona(stats({ commits: 1, issues: 1 }))[0]).toBe('The Spark')
  })

  it('The Spark wins even over a long span', () => {
    expect(
      persona(stats({ commits: 2, first: { date: '2010-01-01' }, last: '2024-01-01' }))[0]
    ).toBe('The Spark')
  })

  it('calls eight or more years The Long Hauler', () => {
    const [title, text] = persona(
      stats({ commits: 3, first: { date: '2012-03-01' }, last: '2020-01-01' })
    )
    expect(title).toBe('The Long Hauler')
    expect(text).toContain('Over 8 years')
  })

  it('calls mostly late-night contributors The Night Owl', () => {
    const hours = hoursOf(40, [23, 12])
    expect(persona(stats({ commits: 40, hours }))[0]).toBe('The Night Owl')
  })

  it('needs at least 30 contributions for The Night Owl', () => {
    const hours = hoursOf(20, [23])
    expect(persona(stats({ commits: 20, hours }))[0]).toBe('The Builder')
  })

  it('falls back to The Builder', () => {
    const hours = hoursOf(40, [10, 14, 16])
    const dow = [0, 10, 10, 10, 10, 0, 0]
    expect(persona(stats({ commits: 40, hours, dow }))).toEqual([
      'The Builder',
      'You rolled up your sleeves and helped build ownCloud.'
    ])
  })

  it('recognises The Explorer and The Steady Light', () => {
    const repos = new Map(Array.from({ length: 8 }, (_, i) => [`repo${i}`, 1]))
    expect(persona(stats({ commits: 8, repos }))[0]).toBe('The Explorer')
    const years = new Map([
      ['2014', 1],
      ['2015', 1],
      ['2016', 1],
      ['2017', 1]
    ])
    expect(persona(stats({ commits: 4, years }))[0]).toBe('The Steady Light')
  })
})

describe('scrubEmails', () => {
  it('replaces email addresses with an ellipsis', () => {
    expect(scrubEmails('Signed-off-by: Jane <jane.doe+oc@example.co.uk>')).toBe(
      'Signed-off-by: Jane <…>'
    )
    expect(scrubEmails('a@b.cd and x_y@foo-bar.org')).toBe('… and …')
  })
  it('leaves other text alone', () => {
    expect(scrubEmails('fix: @mention in comments')).toBe('fix: @mention in comments')
  })
  it('passes empty values through', () => {
    expect(scrubEmails(null)).toBeNull()
    expect(scrubEmails(undefined)).toBeUndefined()
    expect(scrubEmails('')).toBe('')
  })
})

describe('findEmail', () => {
  it('finds the first email-like string', () => {
    expect(findEmail('{"a":"x","b":"me@host.io","c":"you@host.io"}')).toBe('me@host.io')
  })
  it('returns null when there is none', () => {
    expect(findEmail('{"login":"octocat","sub":"@octocat joins the sky."}')).toBeNull()
  })
  it('is stable across calls despite the global regex', () => {
    expect(findEmail('a@b.cd')).toBe('a@b.cd')
    expect(findEmail('a@b.cd')).toBe('a@b.cd')
    expect(EMAIL_RE.lastIndex).toBe(0)
  })
})
