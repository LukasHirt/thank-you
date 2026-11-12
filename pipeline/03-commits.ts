// Step 3: extract commit metadata from the local clones.
// Output: raw/commits/<repo>.json = [[sha, email, name, isoDate, subject], ...]
// Merge commits are skipped. Forks only keep commits authored after the fork was created.
import fs from 'node:fs'
import path from 'node:path'
import { RAW, listRepos, pool, run, writeJSON } from './lib.ts'
import type { CommitRecord } from './lib.ts'

const repos = await listRepos()
// Repos whose early history was imported from a third-party project: only count
// commits made after the repo joined the owncloud org.
const IMPORTED = new Set([
  'conan-center-index',
  'graph-explorer',
  'dav4android',
  'TarStreamer',
  'protocol'
])
const outDir = path.join(RAW, 'commits')
fs.mkdirSync(outDir, { recursive: true })

let total = 0
await pool(repos, 4, async (r) => {
  const git = path.join(RAW, 'repos', `${r.id}.git`)
  if (!fs.existsSync(path.join(git, 'HEAD'))) return console.warn(`missing clone: ${r.name}`)
  let out: string
  const range = ['--branches', '--tags']
  if (r.isFork && r.parent) {
    // Exclude everything that also exists upstream: only owncloud's own work counts.
    try {
      await run('git', [
        '-C',
        git,
        'fetch',
        '--quiet',
        '--filter=blob:none',
        `https://github.com/${r.parent.nameWithOwner}.git`,
        '+refs/heads/*:refs/upstream/*'
      ])
      range.push('--not', '--glob=refs/upstream/*')
    } catch {
      console.warn(`could not fetch upstream of ${r.name}, falling back to date filter`)
    }
  }
  try {
    out = await run(
      'git',
      ['-C', git, 'log', ...range, '--no-merges', '--format=%H%x1f%aE%x1f%aN%x1f%aI%x1f%s%x1e'],
      { maxBuffer: 1 << 30 }
    )
  } catch {
    // empty repos have no refs
    out = ''
  }
  const forkedAt =
    (r.org === 'owncloud' && IMPORTED.has(r.name)) || (r.isFork && !range.includes('--not'))
      ? r.createdAt
      : null
  const seen = new Set<string>()
  const commits: CommitRecord[] = []
  for (const rec of out.split('\x1e')) {
    const line = rec.trim()
    if (!line) continue
    const [sha, email, name, date, subject] = line.split('\x1f')
    if (seen.has(sha)) continue
    seen.add(sha)
    if (forkedAt && date < forkedAt) continue
    commits.push([sha, (email || '').toLowerCase(), name, date, (subject || '').slice(0, 140)])
  }
  total += commits.length
  writeJSON(path.join(outDir, `${r.id}.json`), commits)
  console.log(`${r.name}: ${commits.length}`)
})
console.log(`total commits: ${total}`)
