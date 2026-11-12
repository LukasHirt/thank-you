// Step 1: blobless bare clones of every public repo in the org (history only).
// Re-running fetches updates instead of re-cloning.
import fs from 'node:fs'
import path from 'node:path'
import { RAW, listRepos, pool, run } from './lib.ts'

const repos = await listRepos({ refresh: process.argv.includes('--refresh') })
const dir = path.join(RAW, 'repos')
fs.mkdirSync(dir, { recursive: true })
console.log(`${repos.length} repos`)

let done = 0
const failed: string[] = []
await pool(repos, 6, async (r) => {
  const target = path.join(dir, `${r.id}.git`)
  try {
    if (fs.existsSync(path.join(target, 'HEAD'))) {
      await run('git', [
        '-C',
        target,
        'fetch',
        '--quiet',
        '--prune',
        '--filter=blob:none',
        'origin',
        '+refs/heads/*:refs/heads/*',
        '+refs/tags/*:refs/tags/*'
      ])
    } else {
      await run('git', [
        'clone',
        '--quiet',
        '--bare',
        '--filter=blob:none',
        `https://github.com/${r.full}.git`,
        target
      ])
    }
  } catch (e) {
    failed.push(r.full)
    console.warn(`FAILED ${r.name}: ${(e as Error).message.slice(0, 200)}`)
  }
  console.log(`[${++done}/${repos.length}] ${r.name}`)
})
if (failed.length) console.log('failed:', failed.join(', '))
