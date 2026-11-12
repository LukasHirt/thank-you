import { describe, expect, it } from 'vite-plus/test'
import {
  countUpTo,
  dateOf,
  dayOf,
  esc,
  fmt,
  longDate,
  lowerBound,
  monthYear,
  plural,
  shardOf
} from '../../src/util.ts'

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;'
    )
  })
  it('treats null and undefined as empty', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
    expect(esc(42)).toBe('42')
  })
})

describe('numbers and words', () => {
  it('formats thousands', () => expect(fmt(12345)).toBe('12,345'))
  it('pluralises', () => {
    expect(plural(1, 'year')).toBe('1 year')
    expect(plural(3, 'year')).toBe('3 years')
    expect(plural(2, 'more repository', 'more repositories')).toBe('2 more repositories')
  })
})

describe('story days', () => {
  it('maps days to dates and back', () => {
    expect(dateOf(0).toISOString().slice(0, 10)).toBe('2010-01-01')
    expect(dayOf('2010-01-17')).toBe(16)
    expect(dayOf(dateOf(4321).toISOString())).toBe(4321)
  })
  it('formats dates in English, in UTC', () => {
    expect(monthYear(dayOf('2013-03-14'))).toBe('March 2013')
    expect(longDate('2019-02-22')).toBe('February 22, 2019')
  })
})

describe('sorted array search', () => {
  const births = [0, 5, 5, 9, 20]
  it('lowerBound finds the first element >= value', () => {
    expect(lowerBound(births, -1)).toBe(0)
    expect(lowerBound(births, 5)).toBe(1)
    expect(lowerBound(births, 6)).toBe(3)
    expect(lowerBound(births, 21)).toBe(5)
  })
  it('countUpTo counts elements <= value', () => {
    expect(countUpTo(births, -1)).toBe(0)
    expect(countUpTo(births, 5)).toBe(3)
    expect(countUpTo(births, 20)).toBe(5)
  })
})

describe('shardOf', () => {
  it('matches the shard file names written by the pipeline', () => {
    expect(shardOf('LukasHirt')).toBe('l')
    expect(shardOf('0xdeadbeef')).toBe('0')
    expect(shardOf('-dash')).toBe('_')
  })
})
