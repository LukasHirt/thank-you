import { describe, expect, it } from 'vite-plus/test'
import { ANONYMOUS_COUNT_SUB, applyOptout, parseOptout } from '../../pipeline/rules.ts'
import type { PeopleShard, PersonDetail, SkyData } from '../../src/types.ts'

describe('parseOptout', () => {
  it('reads one handle per line, lowercase, without @', () => {
    const text = [
      '# Do not want to be shown? Add your handle below.',
      '#',
      '# octocat',
      '',
      'LukasHirt',
      '   @Phil-Davis   ',
      '@someone   # same thing, the @ is optional',
      '\t',
      'MiXeD#no space before the note'
    ].join('\n')
    expect([...parseOptout(text)]).toEqual(['lukashirt', 'phil-davis', 'someone', 'mixed'])
  })

  it('returns an empty set for the template only', () => {
    expect(parseOptout('# comment\n#\n\n').size).toBe(0)
  })

  it('handles CRLF line endings', () => {
    expect([...parseOptout('a\r\nB\r\n')]).toEqual(['a', 'b'])
  })
})

function detail(i: number, login: string): PersonDetail {
  return {
    i,
    login,
    born: '2015-01-01',
    first: { date: '2015-01-01', repo: 'core', type: 'commit', text: 'first' },
    last: '2016-01-01',
    totals: { commits: 1, prs: 0, merged: 0, issues: 0, reviews: 0, repos: 1 },
    repos: [['core', 100]],
    years: { '2015': 1 },
    busiest: { year: 2015, count: 1 },
    hours: Array.from({ length: 24 }, () => 0),
    collab: [],
    persona: ['The Spark', '...']
  }
}

function fixture(): { sky: SkyData; shards: Record<string, PeopleShard> } {
  const sky: SkyData = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    day0: '2010-01-01',
    today: 6000,
    projects: [],
    totals: {
      people: 3,
      stardust: 0,
      everyone: 3,
      named: 3,
      commits: 3,
      prs: 0,
      issues: 0,
      reviews: 0,
      repos: 1,
      firstYear: 2010,
      languages: 0,
      dockerPulls: 0,
      botCommits: 0
    },
    milestones: [
      {
        day: 10,
        kind: 'count',
        n: 100,
        star: 1,
        title: 'Contributor number 100',
        sub: '@Octocat joins the sky.',
        project: 0
      },
      {
        day: 20,
        kind: 'count',
        n: 1000,
        star: 2,
        title: 'Contributor number 1,000',
        sub: '@alice joins the sky.',
        project: 0
      },
      { day: 30, kind: 'project', star: 1, title: 'Something', sub: 'unrelated', project: 0 }
    ],
    releases: [],
    stars: {
      login: [null, 'Octocat', 'alice'],
      birth: [1, 10, 20],
      project: [0, 0, 0],
      kind: [2, 0, 0],
      weight: [1, 1, 1],
      pos: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      active: [0, 0, 0]
    },
    constellations: []
  }
  const shards = {
    'o.json': { octocat: detail(1, 'Octocat') },
    'a.json': { alice: detail(2, 'alice') }
  }
  return { sky, shards }
}

describe('applyOptout', () => {
  it('makes the listed handle anonymous', () => {
    const { sky, shards } = fixture()
    const res = applyOptout(sky, shards, new Set(['octocat']))
    expect(res.hidden).toBe(1)
    expect(res.sky.stars.login).toEqual([null, null, 'alice'])
    expect(res.shards['o.json']).toEqual({})
    expect(res.shards['a.json']).toEqual(shards['a.json'])
    expect(res.changed).toEqual(['o.json'])
  })

  it('anonymises the count chapter only', () => {
    const { sky, shards } = fixture()
    const res = applyOptout(sky, shards, new Set(['octocat']))
    expect(res.sky.milestones[0].sub).toBe(ANONYMOUS_COUNT_SUB)
    expect(res.sky.milestones[0].title).toBe('Contributor number 100')
    expect(res.sky.milestones[1].sub).toBe('@alice joins the sky.')
    expect(res.sky.milestones[2].sub).toBe('unrelated')
  })

  it('keeps totals and every other star column unchanged', () => {
    const { sky, shards } = fixture()
    const res = applyOptout(sky, shards, new Set(['octocat', 'alice']))
    expect(res.sky.totals).toEqual(sky.totals)
    expect(res.sky.stars.login).toEqual([null, null, null])
    const { login: _a, ...rest } = res.sky.stars
    const { login: _b, ...before } = sky.stars
    expect(rest).toEqual(before)
  })

  it('does not modify its arguments', () => {
    const { sky, shards } = fixture()
    const copy = structuredClone({ sky, shards })
    applyOptout(sky, shards, new Set(['octocat']))
    expect({ sky, shards }).toEqual(copy)
  })

  it('is idempotent', () => {
    const { sky, shards } = fixture()
    const once = applyOptout(sky, shards, new Set(['octocat']))
    const twice = applyOptout(once.sky, once.shards, new Set(['octocat']))
    expect(twice.sky).toEqual(once.sky)
    expect(twice.shards).toEqual(once.shards)
    expect(twice.hidden).toBe(0)
    expect(twice.changed).toEqual([])
  })

  it('changes nothing without handles or for unknown handles', () => {
    const { sky, shards } = fixture()
    for (const handles of [new Set<string>(), new Set(['nobody'])]) {
      const res = applyOptout(sky, shards, handles)
      expect(res.sky).toEqual(sky)
      expect(res.shards).toEqual(shards)
      expect(res.hidden).toBe(0)
      expect(res.changed).toEqual([])
    }
  })
})
