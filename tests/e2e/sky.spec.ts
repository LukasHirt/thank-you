import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { PeopleShard, SkyData } from '../../src/types.ts'
import { shardOf } from '../../src/util.ts'

// pick real people from the published data, so the tests follow data refreshes
const sky = JSON.parse(readFileSync('public/data/sky.json', 'utf8')) as SkyData
const shard = (login: string) =>
  JSON.parse(readFileSync(`public/data/people/${shardOf(login)}.json`, 'utf8')) as PeopleShard
const contributors = sky.stars.login
  .map((login, i) => ({ login, i }))
  .filter((s): s is { login: string; i: number } => !!s.login && sky.stars.kind[s.i] === 0)
  .filter((s) => shard(s.login)[s.login.toLowerCase()])
const [alice, bob] = [contributors[10], contributors[200]]

/** Collect page errors and failed requests to our own origin. */
function watch(page: Page) {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })
  page.on('response', (r) => {
    if (r.url().startsWith('http://localhost') && r.status() >= 400)
      problems.push(`${r.status()} ${r.url()}`)
  })
  return problems
}

test.beforeEach(async ({ page }) => {
  // avatars come from GitHub: answer locally so tests don't depend on the network
  await page.route('https://avatars.githubusercontent.com/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
      )
    })
  )
})

test('shows the thank-you with the community totals', async ({ page }) => {
  const problems = watch(page)
  await page.goto('./')
  await expect(page.locator('#sky canvas')).toBeVisible()
  const finale = page.locator('#finale')
  await expect(finale).toBeVisible()
  await expect(finale.getByRole('heading')).toContainText(
    `all ${sky.totals.everyone.toLocaleString('en')} of you`
  )
  await expect(finale).toContainText(`${sky.totals.languages} languages`)
  expect(problems).toEqual([])
})

test('the timeline has a marker for every chapter and the thank-you', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.tl-marker')).toHaveCount(sky.milestones.length + 1)
  await page.getByRole('button', { name: 'Explore the sky' }).click()
  await expect(page.locator('#finale')).toBeHidden()
  // the thank-you can always be opened again from the end of the timeline
  await page.getByRole('button', { name: 'Show the thank-you' }).click()
  await expect(page.locator('#finale')).toBeVisible()
})

test('a chapter plays from its marker', async ({ page }) => {
  await page.goto('./')
  const chapter = sky.milestones.find((m) => m.kind === 'project')
  if (!chapter) throw new Error('no project chapter in the data')
  await page.getByRole('button', { name: 'Explore the sky' }).click()
  await page.getByRole('button', { name: new RegExp(`^Jump to chapter: ${chapter.title}`) }).click()
  await expect(page.locator('#beat .beat-title')).toHaveText(chapter.title)
})

test('search opens a story, and you can switch to someone else', async ({ page }) => {
  const problems = watch(page)
  await page.goto('./')
  await page.getByRole('button', { name: 'Find your star' }).click()

  const search = page.getByRole('searchbox', { name: /Find a contributor/ })
  await search.fill(alice.login)
  await page
    .getByRole('option', { name: new RegExp(`@${alice.login}\\b`) })
    .first()
    .click()
  const story = page.getByRole('region', { name: 'Your story' })
  await expect(story).toContainText(`Hello, @${alice.login}.`)

  // jump straight to the last card with the progress bar
  const bars = story.getByRole('button', { name: /^Go to card/ })
  await bars.last().click()
  await expect(story.getByRole('heading', { name: `Thank you, @${alice.login}.` })).toBeVisible()
  await story.getByRole('button', { name: 'Close your story' }).click()
  await expect(page.locator('#chip')).toContainText(`@${alice.login}`)

  await search.fill(bob.login)
  await page
    .getByRole('option', { name: new RegExp(`@${bob.login}\\b`) })
    .first()
    .click()
  await expect(story).toContainText(`Hello, @${bob.login}.`)
  expect(problems).toEqual([])
})

test('a personal link opens that person’s story', async ({ page }) => {
  await page.goto(`./?u=${encodeURIComponent(bob.login)}`)
  await expect(page.getByRole('region', { name: 'Your story' })).toContainText(
    `Hello, @${bob.login}.`
  )
})

test('an unknown handle shows a helpful message', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Explore the sky' }).click()
  await page.getByRole('searchbox', { name: /Find a contributor/ }).fill('zz-no-such-person-zz')
  await expect(page.locator('#results')).toContainText('No star for “zz-no-such-person-zz” yet')
})

test('the About dialog explains the data and how to opt out', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Explore the sky' }).click()
  await page.getByRole('button', { name: 'About this sky' }).click()
  const about = page.getByRole('dialog')
  await expect(about).toContainText('No email addresses are published')
  await expect(about).toContainText('optout.txt')
  await about.getByRole('button', { name: 'Close' }).click()
  await expect(about).toBeHidden()
})

test('no email addresses end up on the page', async ({ page }) => {
  await page.goto(`./?u=${encodeURIComponent(alice.login)}`)
  await expect(page.getByRole('region', { name: 'Your story' })).toBeVisible()
  const html = await page.content()
  expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.(com|org|net|de|cz|io)\b/)
})

test('nothing overflows the screen', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Explore the sky' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  // the timeline and the year row must not overlap
  const timeline = await page.locator('#timeline').boundingBox()
  const year = await page.locator('.year').boundingBox()
  if (!timeline || !year) throw new Error('missing layout')
  const overlaps = !(
    year.y + year.height <= timeline.y ||
    timeline.y + timeline.height <= year.y ||
    year.x + year.width <= timeline.x ||
    timeline.x + timeline.width <= year.x
  )
  expect(overlaps).toBe(false)
})

test.describe('scrubbing the timeline', () => {
  test.use({ reducedMotion: 'no-preference' })

  async function drag(page: Page) {
    const box = await page.getByRole('slider', { name: 'Time' }).boundingBox()
    if (!box) throw new Error('no timeline')
    const y = box.y + box.height * 0.7
    await page.mouse.move(box.x + box.width * 0.3, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 })
    await page.mouse.up()
  }

  test('keeps playing after a drag when it was playing', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('body')).toHaveClass(/playing/)
    await drag(page)
    await expect(page.locator('body')).toHaveClass(/playing/)
    await expect(page.locator('#year')).not.toHaveText('2010')
  })

  test('stays paused after a drag when it was paused', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Pause' }).click()
    await drag(page)
    await page.waitForTimeout(300)
    await expect(page.locator('body')).not.toHaveClass(/playing/)
  })

  test('resumes after arrow keys once they rest', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('body')).toHaveClass(/playing/)
    await page.getByRole('slider', { name: 'Time' }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('body')).not.toHaveClass(/playing/)
    await expect(page.locator('body')).toHaveClass(/playing/, { timeout: 2000 })
  })
})
