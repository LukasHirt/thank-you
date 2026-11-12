// Step 4: map commit author emails to GitHub logins.
// 1) noreply addresses carry the login, 2) otherwise ask GitHub which user authored
// one sample commit for that email (batched GraphQL). Cached + resumable.
// Output: raw/identities.json = { email: login | null }  (raw/ is never published)
import fs from 'node:fs'
import path from 'node:path'
import { RAW, gql, listRepos, readJSON, writeJSON } from './lib.ts'
import type { CommitRecord, Identities, Repo } from './lib.ts'
const byId: Record<string, Repo> = Object.fromEntries((await listRepos()).map((r) => [r.id, r]))

const file = path.join(RAW, 'identities.json')
const map = readJSON<Identities>(file, {})

interface Sample {
  repo: string
  sha: string
  date: string
}
type CommitAuthorData = Record<
  string,
  { object?: { author?: { user?: { login: string } | null } } | null } | null
>

// one sample commit per email (prefer the most recent: more likely linked to an account)
const samples = new Map<string, Sample[]>()
for (const f of fs.readdirSync(path.join(RAW, 'commits'))) {
  const repo = f.replace(/\.json$/, '')
  for (const [sha, email, , date] of readJSON<CommitRecord[]>(path.join(RAW, 'commits', f), [])) {
    if (!email) continue
    const s = samples.get(email)
    if (!s) samples.set(email, [{ repo, sha, date }])
    else if (s.length < 3) s.push({ repo, sha, date })
  }
}

const noreply = /^(?:\d+\+)?([a-z0-9-]+(?:\[bot\])?)@users\.noreply\.github\.com$/i
let todo: [string, Sample[]][] = []
for (const [email, s] of samples) {
  if (email in map) continue
  const m = email.match(noreply)
  if (m) {
    map[email] = m[1]
    continue
  }
  todo.push([email, s])
}
console.log(`${samples.size} emails, ${todo.length} to resolve`)

// try up to 3 sample commits per email
for (let attempt = 0; attempt < 3 && todo.length; attempt++) {
  const next: [string, Sample[]][] = []
  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40)
    const parts = batch.map(([, s], j) => {
      const c = s[attempt]
      return c
        ? `c${j}: repository(owner:"${byId[c.repo].org}",name:"${byId[c.repo].name}"){object(oid:"${c.sha}"){... on Commit{author{user{login}}}}}`
        : ''
    })
    const d = await gql<CommitAuthorData>(`{${parts.join('\n')}}`).catch(
      (e: Error): CommitAuthorData => (console.warn(e.message.slice(0, 200)), {})
    )
    batch.forEach(([email, s], j) => {
      const login = d?.[`c${j}`]?.object?.author?.user?.login
      if (login) map[email] = login
      else if (s[attempt + 1]) next.push([email, s])
      else map[email] = null
    })
    writeJSON(file, map, true)
    process.stdout.write(`\r  pass ${attempt + 1}: ${Math.min(i + 40, todo.length)}/${todo.length}`)
  }
  console.log()
  todo = next
}
writeJSON(file, map, true)
const vals = Object.values(map)
console.log(`resolved ${vals.filter(Boolean).length} / ${vals.length}`)
