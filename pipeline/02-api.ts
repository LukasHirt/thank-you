// Step 2: issues, pull requests and reviews for every repo via GraphQL.
// Resumable: progress per repo is stored in raw/api/<repo>.json.
import fs from 'node:fs'
import path from 'node:path'
import { RAW, gql, listRepos, pool, readJSON, writeJSON } from './lib.ts'
import type { ApiState, Repo } from './lib.ts'

const dir = path.join(RAW, 'api')
fs.mkdirSync(dir, { recursive: true })
const repos = await listRepos()

const ISSUES = `query($o:String!,$n:String!,$c:String){repository(owner:$o,name:$n){issues(first:100,after:$c,orderBy:{field:CREATED_AT,direction:ASC}){
  pageInfo{hasNextPage endCursor} nodes{number createdAt title author{login __typename}}}}}`
const PRS = `query($o:String!,$n:String!,$c:String,$p:Int!){repository(owner:$o,name:$n){pullRequests(first:$p,after:$c,orderBy:{field:CREATED_AT,direction:ASC}){
  pageInfo{hasNextPage endCursor} nodes{number createdAt mergedAt title author{login __typename}
  reviews(first:40){nodes{submittedAt state author{login __typename}}}}}}}`

interface Actor {
  login: string
  __typename: string
}
interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}
interface IssuesData {
  repository: {
    issues: {
      pageInfo: PageInfo
      nodes: ({ number: number; createdAt: string; title: string; author: Actor | null } | null)[]
    }
  } | null
}
interface PrsData {
  repository: {
    pullRequests: {
      pageInfo: PageInfo
      nodes: ({
        number: number
        createdAt: string
        mergedAt: string | null
        title: string
        author: Actor | null
        reviews: {
          nodes: ({ submittedAt: string | null; state: string; author: Actor | null } | null)[]
        } | null
      } | null)[]
    }
  } | null
}

const login = (a: Actor | null): string | null =>
  a ? (a.__typename === 'Bot' ? `${a.login}[bot]` : a.login) : null

async function collect(repo: Repo): Promise<ApiState> {
  const file = path.join(dir, `${repo.id}.json`)
  const st = readJSON<ApiState>(file, {
    issues: [],
    prs: [],
    reviews: [],
    issueCursor: null,
    prCursor: null,
    issuesDone: false,
    prsDone: false
  })
  if (st.issuesDone && st.prsDone) return st
  const vars = { o: repo.org, n: repo.name }
  while (!st.issuesDone) {
    const d = await gql<IssuesData>(ISSUES, { ...vars, c: st.issueCursor })
    const c = d.repository?.issues
    if (!c) {
      st.issuesDone = true
      break
    }
    for (const i of c.nodes)
      if (i) st.issues.push([login(i.author), i.createdAt, i.number, i.title])
    st.issueCursor = c.pageInfo.endCursor
    st.issuesDone = !c.pageInfo.hasNextPage
    writeJSON(file, st)
  }
  let pageSize = 50
  while (!st.prsDone) {
    let d: PrsData
    try {
      d = await gql<PrsData>(PRS, { ...vars, c: st.prCursor, p: pageSize })
    } catch (e) {
      if (pageSize > 10) {
        pageSize = Math.floor(pageSize / 2)
        continue
      }
      throw e
    }
    const c = d.repository?.pullRequests
    if (!c) {
      st.prsDone = true
      break
    }
    for (const p of c.nodes) {
      if (!p) continue
      const author = login(p.author)
      st.prs.push([author, p.createdAt, p.mergedAt, p.number, p.title])
      for (const r of p.reviews?.nodes ?? []) {
        if (r?.submittedAt)
          st.reviews.push([login(r.author), r.submittedAt, author, p.number, r.state])
      }
    }
    st.prCursor = c.pageInfo.endCursor
    st.prsDone = !c.pageInfo.hasNextPage
    writeJSON(file, st)
  }
  return st
}

let done = 0
await pool(repos, 3, async (r) => {
  try {
    const st = await collect(r)
    console.log(
      `[${++done}/${repos.length}] ${r.name}: ${st.issues.length} issues, ${st.prs.length} PRs, ${st.reviews.length} reviews`
    )
  } catch (e) {
    console.warn(`FAILED ${r.name}: ${(e as Error).message.slice(0, 300)}`)
  }
})
