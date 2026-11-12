import { describe, expect, it } from 'vite-plus/test'
import { spread } from '../../src/timeline.ts'

describe('spread (timeline markers)', () => {
  it('leaves markers alone when they are far enough apart', () => {
    expect(spread([0, 50, 100], 16, 0, 200)).toEqual([0, 50, 100])
  })
  it('pushes crowded markers apart, keeping their order', () => {
    expect(spread([10, 12, 14], 16, 0, 200)).toEqual([10, 26, 42])
  })
  it('keeps markers inside the timeline, shifting back from the end', () => {
    expect(spread([190, 195, 200], 16, 0, 200)).toEqual([168, 184, 200])
  })
  it('handles an empty timeline', () => {
    expect(spread([], 16, 0, 200)).toEqual([])
  })
})
