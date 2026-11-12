// Applies optout.txt to the published data in public/data. Needs no raw data or token,
// so it runs on every build (locally and in CI) and after `data:build`. Idempotent.
//
// For each listed handle: the star stays (so totals don't change) but it becomes
// anonymous: no name, avatar, search entry, personal story or chapter mention.
// The rules live in applyOptout (rules.ts); this file only reads and writes.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyOptout, parseOptout } from './rules.ts'
import type { PeopleShard, SkyData } from '../src/types.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'public', 'data')
const handles = parseOptout(fs.readFileSync(path.join(ROOT, 'optout.txt'), 'utf8'))

const skyFile = path.join(DATA, 'sky.json')
const peopleDir = path.join(DATA, 'people')
const sky = JSON.parse(fs.readFileSync(skyFile, 'utf8')) as SkyData
const shards: Record<string, PeopleShard> = {}
for (const f of fs.readdirSync(peopleDir)) {
  shards[f] = JSON.parse(fs.readFileSync(path.join(peopleDir, f), 'utf8')) as PeopleShard
}

const result = applyOptout(sky, shards, handles)
fs.writeFileSync(skyFile, JSON.stringify(result.sky))
for (const f of result.changed)
  fs.writeFileSync(path.join(peopleDir, f), JSON.stringify(result.shards[f]))

const links = path.join(ROOT, 'raw', 'links.csv')
if (fs.existsSync(links)) {
  const lines = fs.readFileSync(links, 'utf8').split('\n')
  fs.writeFileSync(
    links,
    lines.filter((l, k) => k === 0 || !handles.has(l.split(',')[0].toLowerCase())).join('\n')
  )
}
console.log(
  `opt-out: ${handles.size} handle(s) listed, ${result.hidden} star(s) made anonymous in this run`
)
