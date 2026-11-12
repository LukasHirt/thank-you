// Step 5: extras: Docker Hub pulls (dated snapshots), releases (shooting stars),
// translation languages (at least half translated).
import path from 'node:path'
import { RAW, byCodeUnit, run, readJSON, writeJSON } from './lib.ts'
import type { Extras, PullSnapshot, ReleaseRecord } from './lib.ts'
import { langBase as base, majorReleases } from './rules.ts'

const extras: Extras = {}

// --- Docker Hub: ownCloud itself only, no base/CI images
const IMAGES = ['owncloud/server', 'owncloud/ocis', 'owncloud/ocis-rolling']
const snapFile = path.join(RAW, '..', 'pipeline', 'docker-pulls-history.json') // committed: grows over time
const history = readJSON<PullSnapshot[]>(snapFile, [])
const pulls: Record<string, number> = {}
for (const img of IMAGES) {
  const res = await fetch(`https://hub.docker.com/v2/repositories/${img}/`)
  pulls[img] = ((await res.json()) as { pull_count?: number }).pull_count ?? 0
}
const today = new Date().toISOString().slice(0, 10)
if (!history.some((h) => h.date === today)) history.push({ date: today, pulls })
writeJSON(snapFile, history, true)
extras.dockerPulls = {
  date: today,
  total: Object.values(pulls).reduce((a, b) => a + b, 0),
  images: pulls
}

// --- Releases: final X.Y.0 tags of the main products
const PRODUCTS = {
  core: 'ownCloud Server',
  ocis: 'Infinite Scale',
  client: 'Desktop',
  android: 'Android',
  'ios-app': 'iOS',
  web: 'Web'
}
const releases: ReleaseRecord[] = []
for (const [repo, label] of Object.entries(PRODUCTS)) {
  const git = path.join(RAW, 'repos', `${repo}.git`)
  const out = await run('git', [
    '-C',
    git,
    'for-each-ref',
    'refs/tags',
    '--format=%(refname:short)\t%(creatordate:iso-strict)'
  ])
  const tags = out
    .trim()
    .split('\n')
    .map((l) => l.split('\t') as [string, string?])
  for (const { version, date } of majorReleases(tags)) releases.push({ repo, label, version, date })
}
releases.sort((a, b) => a.date.localeCompare(b.date))
extras.releases = releases

// --- Translations: languages that are at least half translated in ownCloud Server,
// the Android app or the desktop client (stub files Transifex creates for every
// language don't count). English variants don't count either.
const langs = new Set<string>()
async function files(repo: string) {
  const git = path.join(RAW, 'repos', `${repo}.git`)
  const out = await run('git', ['-C', git, 'ls-tree', '-r', '--name-only', 'HEAD'], {
    maxBuffer: 1 << 28
  }).catch(() => '')
  return { git, list: out.split('\n') }
}
async function show(git: string, file: string) {
  return run('git', ['-C', git, 'show', `HEAD:${file}`], { maxBuffer: 1 << 26 }).catch(() => '')
}
async function collect(repo: string, re: RegExp, count: (text: string) => number) {
  const { git, list } = await files(repo)
  const res: Record<string, number> = {}
  for (const f of list) {
    const m = f.match(re)
    if (m) res[m[1]] = count(await show(git, f))
  }
  const max = Math.max(0, ...Object.values(res))
  for (const [code, n] of Object.entries(res))
    if (max && n >= 0.5 * max && base(code) !== 'en') langs.add(base(code))
}
await collect('core', /^core\/l10n\/(.+)\.json$/, (t) => {
  try {
    return Object.keys((JSON.parse(t) as { translations?: object }).translations || {}).length
  } catch {
    return 0
  }
})
await collect(
  'android',
  /^owncloudApp\/src\/main\/res\/values-([a-z]{2,3}(?:-r[A-Z]{2})?)\/strings\.xml$/,
  (t) => (t.match(/<string /g) || []).length
)
await collect(
  'client',
  /^translations\/client_(.+)\.ts$/,
  (t) => (t.match(/<translation>(?!<\/translation>)/g) || []).length
)
extras.languages = [...langs].sort(byCodeUnit)

writeJSON(path.join(RAW, 'extras.json'), extras, true)
console.log(
  `pulls ${extras.dockerPulls?.total}, ${releases.length} releases, ${langs.size} languages`
)
