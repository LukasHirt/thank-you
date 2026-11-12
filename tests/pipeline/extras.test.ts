import { describe, expect, it } from 'vite-plus/test'
import { langBase, majorReleases, parseReleaseTag } from '../../pipeline/rules.ts'

describe('langBase', () => {
  it.each([
    ['de', 'de'],
    ['de_DE', 'de'],
    ['pt_BR', 'pt'],
    ['pt-rBR', 'pt'],
    ['zh-rCN', 'zh'],
    ['sr@latin', 'sr'],
    ['en_GB', 'en'],
    ['DE', 'de']
  ])('%s -> %s', (code, base) => {
    expect(langBase(code)).toBe(base)
  })
})

describe('parseReleaseTag', () => {
  it.each([
    ['v2.0', 2, 0],
    ['v2.0.0', 2, 0],
    ['10.0', 10, 0],
    ['oC4.0', 4, 0],
    ['release-3.0.0', 3, 0],
    ['V7.1', 7, 1]
  ])('parses %s', (tag, major, minor) => {
    expect(parseReleaseTag(tag)).toEqual({ major, minor })
  })

  it.each(['v2.0.1', 'v2.0.0-rc1', 'v1.0.0-beta', 'latest', 'v2', '2.0.0.1'])(
    'rejects %s',
    (tag) => {
      expect(parseReleaseTag(tag)).toBeNull()
    }
  )
})

describe('majorReleases', () => {
  it('keeps X.0 releases, oldest first, with the date as YYYY-MM-DD', () => {
    expect(
      majorReleases([
        ['v2.0.0', '2022-11-30T10:00:00+01:00'],
        ['v1.0.0', '2021-01-18T12:00:00+01:00'],
        ['v1.1.0', '2021-06-01T12:00:00+01:00'],
        ['v1.0.1', '2021-02-01T12:00:00+01:00'],
        ['v2.0.0-rc.1', '2022-10-01T12:00:00+01:00']
      ])
    ).toEqual([
      { version: '1.0', date: '2021-01-18' },
      { version: '2.0', date: '2022-11-30' }
    ])
  })

  it('ignores stray tags that go backwards and duplicates', () => {
    expect(
      majorReleases([
        ['v3.0.0', '2020-01-01T00:00:00Z'],
        ['v2.0.0', '2021-01-01T00:00:00Z'],
        ['3.0', '2021-06-01T00:00:00Z'],
        ['v4.0', '2022-01-01T00:00:00Z']
      ])
    ).toEqual([
      { version: '3.0', date: '2020-01-01' },
      { version: '4.0', date: '2022-01-01' }
    ])
  })

  it('skips tags without a date', () => {
    expect(majorReleases([['v1.0.0'], ['v2.0.0', '']])).toEqual([])
  })
})
