import { describe, expect, it } from 'vite-plus/test'
import { cards } from '../../src/story.ts'
import { makePerson, makeSky } from '../fixtures/sky.ts'

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('story cards', () => {
  it('builds every card when all data is there, ending with the thank-you', () => {
    const { list, year } = cards(makePerson(), makeSky())
    expect(year).toBe('2018')
    expect(list).toHaveLength(9)
    expect(text(list[0])).toContain('Your star first lit up on March 19, 2018')
    expect(text(list[0])).toContain('Web constellation')
    expect(text(list.at(-1) ?? '')).toContain('Thank you, @bob.')
  })

  it('escapes text coming from the data', () => {
    const { list } = cards(makePerson(), makeSky())
    expect(list[1]).toContain('Add &lt;rename&gt; to files')
    expect(list[1]).not.toContain('<rename>')
  })

  it('leaves out cards that have nothing to show', () => {
    const person = makePerson({
      totals: { commits: 1, prs: 0, merged: 0, issues: 0, reviews: 0, repos: 1 },
      repos: [],
      years: { '2020': 1 },
      busiest: { year: 2020, count: 1 },
      hours: Array.from({ length: 24 }, () => 0),
      collab: [],
      persona: ['The Spark', 'Every constellation starts with a single point of light.']
    })
    const { list } = cards(person, makeSky())
    const all = list.map(text).join(' | ')
    expect(all).not.toContain('Where you spent your time')
    expect(all).not.toContain('Your busiest year')
    expect(all).not.toContain('Your rhythm')
    expect(all).not.toContain('You shared the sky with')
    expect(all).toContain('1 commit')
    expect(all).not.toContain('pull requests')
  })

  it('mentions work from before ownCloud', () => {
    const person = makePerson({
      first: { date: '2008-05-01', repo: 'client', type: 'commit', text: 'csync' }
    })
    expect(text(cards(person, makeSky()).list[0])).toContain('goes back even further, to 2008')
  })

  it('skips collaborators that opted out (no login)', () => {
    const sky = makeSky()
    sky.stars.login[0] = null
    const { list } = cards(makePerson({ collab: [0, 2] }), sky)
    const shared = list.find((c) => c.includes('You shared the sky with')) ?? ''
    expect(shared).toContain('@carol')
    expect(shared).not.toContain('@null')
  })
})
