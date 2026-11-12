// Small shared helpers. Pure functions here are covered by tests/unit/util.test.ts.

/** Day 0 of the story: 2010-01-01 (UTC). */
export const DAY0 = Date.UTC(2010, 0, 1)
const DAY_MS = 86_400_000

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Escape text for safe use inside HTML. */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
}

/** 12345 → "12,345" */
export function fmt(value: number): string {
  return value.toLocaleString('en')
}

/** plural(1, 'year') → "1 year", plural(3, 'year') → "3 years" */
export function plural(value: number, one: string, many = `${one}s`): string {
  return `${fmt(value)} ${value === 1 ? one : many}`
}

/** The date of a story day. */
export function dateOf(day: number): Date {
  return new Date(DAY0 + day * DAY_MS)
}

/** The story day of an ISO date. */
export function dayOf(iso: string): number {
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - DAY0) / DAY_MS)
}

/** "March 2013" */
export function monthYear(day: number): string {
  return dateOf(day).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "14 March 2013" style long date for an ISO date string. */
export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

/** Index of the first element in a sorted array that is >= value. */
export function lowerBound(sorted: ArrayLike<number>, value: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** How many elements of a sorted array are <= value. */
export function countUpTo(sorted: ArrayLike<number>, value: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** GitHub avatar URL for a login. */
export function avatar(login: string, size = 96): string {
  return `https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=${size}`
}

/** querySelector that fails loudly: the page markup is ours, a missing element is a bug. */
export function $<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`missing element: ${selector}`)
  return el
}

/** Shard file for a login: first character, non-alphanumerics become "_". */
export function shardOf(login: string): string {
  return login[0].toLowerCase().replace(/[^a-z0-9]/, '_')
}
