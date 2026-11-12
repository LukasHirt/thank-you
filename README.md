# Thank you · the ownCloud sky

An interactive thank-you to everyone who ever contributed to ownCloud.

Every contributor is a star. The sky builds itself over time: each star lights up on the
day of that person's first contribution and settles into the constellation of the
project they worked on most. Watch the story play, grab the year dial to travel through
time, or search for your GitHub handle to get your own story and a shareable thank-you card.

Personal links: `…/?u=<github-handle>` opens the show with your star already glowing.

## What's in the data

- All **public** repositories of the [`owncloud`](https://github.com/owncloud) and
  [`owncloud-docker`](https://github.com/owncloud-docker) organizations, archived ones included.
  Private repositories are never listed or used.
- Commits (from git history), plus issues, pull requests and reviews (GitHub API).
- Commit emails are only used to match people to GitHub accounts during the build. They
  are **never written to the published data** (the build fails if anything looks like an
  email address).
- Bots are left out. Contributors without a linked GitHub account appear as unnamed stars.
- Forks only count work that isn't in their upstream. Repos with imported third-party
  history only count commits made after they joined the org.
- Translators are thanked as a group (their names live in Transifex, not in git).
- Docker Hub pulls of `owncloud/server`, `owncloud/ocis` and `owncloud/ocis-rolling`. A dated
  snapshot is kept in `pipeline/docker-pulls-history.json` each time the data is refreshed.

### Opting out

Add your GitHub handle on its own line at the end of [`optout.txt`](optout.txt) and open a
pull request (or open an issue and we'll do it for you). For example:

```text
# Add your handle below this line:
octocat
```

Upper/lower case doesn't matter, a leading `@` is fine, and anything after a `#` is ignored.

The opt-out is applied
to the published data on every build (`npm run build`, which the Pages workflow runs), so
it takes effect with the next deploy. A data refresh isn't needed. Your star stays in the
sky (the totals don't change) but becomes anonymous: no name, avatar, search entry,
personal story or chapter mention. Note that earlier versions of the data remain in the
git history of this repository.

## Development

Built with [Vite+](https://viteplus.dev) (Vite, Vitest, Oxlint, Oxfmt), TypeScript (strict)
and [three.js](https://threejs.org). Requires Node 26 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm dev            # http://localhost:5173
pnpm check          # format, lint and type check (vp check)
pnpm test           # unit tests (Vitest)
pnpm test:e2e       # end-to-end tests (Playwright, desktop + phone)
pnpm build          # applies optout.txt, then builds to dist/
```

Code style follows the other ownCloud projects (`@ownclouders/tsconfig`, the
`@ownclouders/prettier-config` settings, applied by Oxfmt). `pnpm fmt` formats everything.

Layout:

- `src/`: the site (`main.ts` directs the show, `sky.ts` is the WebGL sky, `timeline.ts`,
  `story.ts`, `share.ts`, `sound.ts`, `types.ts` = the published data format)
- `pipeline/`: the data pipeline (run directly by Node 26, `rules.ts` holds the pure,
  tested rules: bots, projects, personas, privacy, opt-out)
- `tests/unit`, `tests/pipeline`: unit tests; `tests/e2e`: Playwright tests

### Refreshing the data

Needs an authenticated `gh` CLI (or `GITHUB_TOKEN`). Takes a while the first time (cloning
~200 repos and paging through the API). Every step is resumable, and intermediate files go
to `raw/` (git-ignored, never published).

```sh
pnpm data:clone       # blobless clones of every public repo
pnpm data:api         # issues, PRs, reviews (GraphQL)
pnpm data:commits     # commit metadata from the clones
pnpm data:identities  # match commit emails to GitHub accounts
pnpm data:extras      # Docker pulls, releases, translation languages
pnpm data:build       # writes public/data/* and raw/links.csv, then applies optout.txt
```

To start the API collection from scratch, delete `raw/api/`. `raw/links.csv` lists every
contributor with their personal link. Set `BASE_URL` for `data:build` to generate the links
for the final home of the site. Commit the updated `public/data/` afterwards.

## CI

- **Test**: REUSE compliance, dependency licenses, `vp check`, unit tests, build, and the
  end-to-end tests.
- **Deploy to GitHub Pages**: on every push to `main`. The site uses relative URLs, so it
  works from any sub-path.
- **Zizmor** and **commit message** checks via ownCloud's reusable workflows.
- Dependabot keeps npm packages and GitHub Actions up to date. All actions are pinned to
  commit SHAs.

## License

Apache-2.0, see [LICENSE](LICENSE). The project follows the [REUSE](https://reuse.software)
specification (`REUSE.toml`).
