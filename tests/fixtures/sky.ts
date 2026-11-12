import type { PersonDetail, SkyData } from '../../src/types.ts'

/** A tiny but complete sky for tests. */
export function makeSky(): SkyData {
  return {
    generatedAt: '2026-11-12T00:00:00.000Z',
    day0: '2010-01-01',
    today: 6159,
    projects: [
      {
        id: 'server',
        name: 'ownCloud Server',
        color: '#6fa8ff',
        center: [0, 0],
        radius: 0.5,
        since: 68
      },
      { id: 'web', name: 'Web', color: '#c79bff', center: [1, -0.5], radius: 0.2, since: 2685 }
    ],
    totals: {
      people: 2,
      stardust: 1,
      everyone: 3,
      named: 3,
      commits: 120,
      prs: 40,
      issues: 9,
      reviews: 30,
      repos: 2,
      firstYear: 2010,
      languages: 47,
      dockerPulls: 36_000_000,
      botCommits: 0
    },
    milestones: [],
    releases: [],
    stars: {
      login: ['alice', 'bob', 'carol'],
      birth: [100, 3000, 4000],
      project: [0, 1, 0],
      kind: [0, 0, 1],
      weight: [6, 4, 1],
      pos: [0, 0, 0, 1, -0.5, 0.1, 0.2, 0.1, -0.1],
      active: [1, 512, 1024]
    },
    constellations: [[], []]
  }
}

/** A person with every card's data present. */
export function makePerson(overrides: Partial<PersonDetail> = {}): PersonDetail {
  return {
    i: 1,
    login: 'bob',
    born: '2018-03-19',
    first: { date: '2018-03-19', repo: 'web', type: 'pr', text: 'Add <rename> to files' },
    last: '2026-10-01',
    totals: { commits: 300, prs: 120, merged: 110, issues: 5, reviews: 250, repos: 9 },
    repos: [
      ['web', 70],
      ['ocis', 20]
    ],
    years: { '2018': 10, '2019': 40, '2020': 25 },
    busiest: { year: 2019, count: 40 },
    hours: Array.from({ length: 24 }, (_, h) => (h === 11 ? 30 : 2)),
    collab: [0],
    persona: ['The Guardian', 'You reviewed other people’s work again and again.'],
    ...overrides
  }
}
