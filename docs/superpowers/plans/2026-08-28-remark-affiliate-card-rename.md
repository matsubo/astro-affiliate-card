# remark-affiliate-card Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Republish `astro-affiliate-card` as `remark-affiliate-card` 1.0.0 in a new
repository with the Astro integration removed, move all five consuming sites onto it,
and retire the old package and repository.

**Architecture:** The package stops being an Astro integration and becomes what it
already was underneath — a remark plugin. `src/index.ts` sheds the
`astro:config:setup` hook and becomes a barrel whose default export is the plugin;
everything else in `src/` is untouched. The Astro peer dependency, its CI matrix and
the weekly schedule that existed only to watch it all go away with it.

**Tech Stack:** TypeScript (NodeNext, `verbatimModuleSyntax`), bun (test + coverage +
package manager), Biome, unified/remark/mdast, GitHub Actions, npm, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-08-27-remark-affiliate-card-rename-design.md`
(carried into the new repository by the clone in Task 1)

## Global Constraints

- Docs, code comments and commit messages in English. Conventional commits.
- Comments say why, not what. Read the neighbouring comment before changing one.
- `bunfig.toml` enforces coverage **per file** at `lines = 0.9, functions = 0.9`.
  Never lower it to go green.
- Biome: single quotes, no semicolons, 100 columns. `bun run lint` applies fixes.
- Tests that read credentials must pass an explicit `root` (a tmpdir) and
  save/delete/restore the environment variables they touch — the repository's `.env`
  holds live credentials and `resolveOptions` merges `process.env` last.
- Release invariant: the npm version, the git tag and the GitHub release always match.
  In the new repository they start at `v1.0.0`.
- **Human gates.** Stop and ask, every time, for: `gh repo create`, any `git push`,
  `npm publish`, `npm deprecate`, `gh repo archive`. Approving this plan does not
  approve any of them.

## Paths

| | |
|---|---|
| Old repo | `/Volumes/nvme/matsu/ghq/github.com/matsubo/astro-affiliate-card` |
| New repo | `/Volumes/nvme/matsu/ghq/github.com/matsubo/remark-affiliate-card` |
| Sites | `/Volumes/nvme/matsu/ghq/github.com/matsubo/{impreza-gdb,blog,zc33s,je1wfv,triathlon}` |

Tasks 2–6 run in the **new** repo. Task 7–8 run in the sites. Task 9 runs in the old repo.

---

### Task 1: Stand up the new repository with history intact

**Files:**
- Create: the working tree at `/Volumes/nvme/matsu/ghq/github.com/matsubo/remark-affiliate-card`

**Interfaces:**
- Consumes: nothing.
- Produces: a local git repository containing all commits through the spec commits,
  with `origin` pointing at `git@github.com:matsubo/remark-affiliate-card.git`.

- [ ] **Step 1: Confirm the npm name is still free**

```sh
npm view remark-affiliate-card version
```

Expected: `npm error code E404`. If it returns a version, STOP — the name was taken
since the design was written, and the name decision has to be reopened with the human.

- [ ] **Step 2: HUMAN GATE — create the GitHub repository**

Ask first. On approval:

```sh
gh repo create matsubo/remark-affiliate-card --public \
  --description "remark plugin that renders Amazon / Rakuten / Yahoo! affiliate product cards"
```

- [ ] **Step 3: Clone the local working copy, not GitHub**

The last four commits are not on the old GitHub remote yet; cloning the local path is
what carries them over. `--no-hardlinks` keeps the new repository's object store
independent of the old directory.

```sh
git clone --no-hardlinks \
  /Volumes/nvme/matsu/ghq/github.com/matsubo/astro-affiliate-card \
  /Volumes/nvme/matsu/ghq/github.com/matsubo/remark-affiliate-card
```

- [ ] **Step 4: Repoint the remote**

```sh
cd /Volumes/nvme/matsu/ghq/github.com/matsubo/remark-affiliate-card
git remote set-url origin git@github.com:matsubo/remark-affiliate-card.git
git remote -v
```

Expected: both fetch and push read `matsubo/remark-affiliate-card`.

- [ ] **Step 5: Verify the history and the tree came across**

```sh
OLD=/Volumes/nvme/matsu/ghq/github.com/matsubo/astro-affiliate-card
test "$(git log --oneline | wc -l)" = "$(git -C $OLD log --oneline | wc -l)" && echo 'same depth'
git log --oneline | grep 3d6347f   # the partNumber decision must be present
ls docs/superpowers/specs/ docs/superpowers/plans/
bun install && bun run test:coverage
```

Expected: `same depth`, `3d6347f` present, the spec and this plan both listed,
185 tests pass, every file at 100%. The count is compared against the source
repository rather than hard-coded, so amending the plan cannot make this step lie.

Note: `git clone` of a local path brings no tags by default in some git versions; the
old repository's `v0.x` tags are deliberately *not* wanted here, so do not fetch them.
Verify with `git tag` — expect empty output.

---

### Task 2: Drop the Astro integration; make the entry point the plugin

**Files:**
- Modify: `src/index.ts` (whole file replaced)
- Replace: `src/index.test.ts` (whole file replaced)

**Interfaces:**
- Consumes: `remarkAmazon`, `createRemarkAmazon` from `./remark.js`; `renderAmazonCard`
  from `./card.js`; `extractAsin`, `resolveShopLinks` from `./shops.js`. All already exist.
- Produces: `src/index.ts` whose **default export is `remarkAmazon`**, with named
  exports `remarkAmazon`, `createRemarkAmazon`, `renderAmazonCard`, everything in
  `shops.ts`, and the types `AmazonCardData`, `CardLabels`, `AffiliateCardOptions`,
  `ProductRecord`, `RemarkAmazonOptions`. `IntegrationOptions` ceases to exist.

- [ ] **Step 1: Replace the test file with one that tests the barrel**

The current `src/index.test.ts` (253 lines) tests the integration hook. Its
`resolveOptions` coverage is not lost: `src/options.test.ts` independently keeps
`options.ts` at 100% — this was measured before the plan was written by removing
`index.test.ts` and re-running coverage.

Write `src/index.test.ts` in full:

```ts
/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import plugin, {
  createRemarkAmazon,
  extractAsin,
  remarkAmazon,
  renderAmazonCard,
  resolveShopLinks,
} from './index.js'

// A `remark-*` package default-exports its plugin. That convention is the whole
// reason the entry point stopped being an Astro integration, so it is worth a
// test of its own rather than leaving it to the export map.
describe('package entry point', () => {
  test('default-exports the remark plugin', () => {
    expect(plugin).toBe(remarkAmazon)
  })

  test('re-exports the factory a site registers itself', () => {
    expect(typeof createRemarkAmazon).toBe('function')
  })

  test('re-exports the card renderer', () => {
    expect(typeof renderAmazonCard).toBe('function')
  })

  // A value re-export, not a type one: `export *` would silently drop these if
  // shops.ts ever became types-only.
  test('re-exports the shop helpers as values', () => {
    expect(typeof resolveShopLinks).toBe('function')
    expect(extractAsin('https://www.amazon.co.jp/dp/B00TQMO5E0')).toBe('B00TQMO5E0')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```sh
bun test src/index.test.ts
```

Expected: FAIL. `plugin` is still `affiliateCard`, the integration factory, so
`expect(plugin).toBe(remarkAmazon)` fails; `extractAsin` and `resolveShopLinks` do
resolve today because `index.ts` already re-exports `shops.js`.

- [ ] **Step 3: Replace `src/index.ts` with the barrel**

```ts
// The package entry point. `remark-*` packages default-export their plugin, so
// that is what `.` resolves to; the card renderer and the shop helpers are here
// because a site occasionally builds a card outside Markdown.

export { renderAmazonCard } from './card.js'
export type { AmazonCardData, CardLabels } from './card.js'
export type { AffiliateCardOptions } from './options.js'
export {
  createRemarkAmazon,
  type ProductRecord,
  remarkAmazon,
  remarkAmazon as default,
  type RemarkAmazonOptions,
} from './remark.js'
export * from './shops.js'
```

- [ ] **Step 4: Run the whole suite with coverage**

```sh
bun run lint && bun run typecheck && bun run test:coverage
```

Expected: PASS. 172 tests (168 after dropping the old integration tests, plus the four
above). Every file at 100%, including `src/index.ts`.

If `src/index.ts` reports below the threshold, the barrel test is not importing
something the barrel exports — add it to the test rather than lowering the gate.

- [ ] **Step 5: Commit**

```sh
git add src/index.ts src/index.test.ts
git commit -m "feat!: make the remark plugin the package entry point

The Astro integration is gone. Every consuming site declares
markdown.processor and registers the plugin through createRemarkAmazon,
so nothing imported the default export -- and Astro 7's native processor
runs no remark plugins, which is why they all moved. Its only mechanism,
updateConfig({ markdown: { remarkPlugins } }), is a no-op there.

The entry point now default-exports remarkAmazon, which is what a remark-*
package is expected to do."
```

---

### Task 3: Rename the package and cut astro out of its metadata

**Files:**
- Modify: `package.json`
- Modify: `bun.lock` (by `bun install`)
- Modify: `src/remark.ts:132` — a docstring naming the specifier this task deletes

**Interfaces:**
- Consumes: the barrel from Task 2.
- Produces: a package named `remark-affiliate-card` at `1.0.0`, exporting `.`,
  `./card`, `./shops`, `./card.css` — and no longer `./remark`.

- [ ] **Step 1: Apply the metadata changes**

In `package.json`:

- `"name": "astro-affiliate-card"` → `"name": "remark-affiliate-card"`
- `"version": "0.4.1"` → `"version": "1.0.0"`
- `"description"` → `"remark plugin that renders Amazon / Rakuten / Yahoo! affiliate product cards"`
- `"repository".url` → `"git+https://github.com/matsubo/remark-affiliate-card.git"`
- `"keywords"` → `["remark", "remark-plugin", "unified", "mdast", "markdown", "affiliate", "amazon", "rakuten", "yahoo", "astro"]`
  (`astro-integration` is dropped: it is the keyword Astro's catalogue reads, and this
  is no longer an integration. Plain `astro` stays — Astro sites are still the audience.)
- Delete the `"./remark"` entry from `"exports"`.
- Delete `"astro": ">=4.0.0"` from `"peerDependencies"`, leaving only `remark-directive`.
- Delete the `"astro"` entry from `"peerDependenciesMeta"`, leaving only `remark-directive`.

- [ ] **Step 2: Remove the astro devDependency**

```sh
bun remove astro
```

- [ ] **Step 3: Fix the docstring that names the dropped specifier**

`src/remark.ts:132` shows sites how to import the factory, using the `./remark`
subpath this task removes. It is the only reference to the old name left in `src/`
after Task 2:

```
 * import { createRemarkAmazon } from 'astro-affiliate-card/remark'
```

becomes

```
 * import { createRemarkAmazon } from 'remark-affiliate-card'
```

- [ ] **Step 4: Verify nothing reaches for astro any more**

```sh
grep -rn "astro" package.json                    # expect only the "astro" keyword
grep -rn "from 'astro'" src/                     # expect no matches
bun run build
grep -rn "from 'astro'" dist/                    # expect no matches
node -e "import('./dist/index.js').then(m => console.log(typeof m.default, Object.keys(m).length))"
```

Expected: the `node -e` line prints `function` and a key count of at least 12.

- [ ] **Step 5: Run the full gate**

```sh
bun run lint:ci && bun run typecheck && bun run test:coverage && bun run build
```

Expected: all pass. This is exactly what `prepublishOnly` will run in Task 6.

- [ ] **Step 6: Commit**

```sh
git add package.json bun.lock src/remark.ts
git commit -m "feat!: rename the package to remark-affiliate-card

Nothing shipped depends on Astro: the only external runtime import in the
whole package is unist-util-visit, in dist/remark.js. What it is, precisely,
is a remark plugin, and the unified ecosystem names those remark-*.

The astro-integration keyword goes with the integration -- listing a
non-integration in Astro's catalogue would be wrong. Plain astro stays,
because Astro sites are still who this is for. ./remark is dropped: . is
the plugin now."
```

---

### Task 4: Delete the Astro CI matrix and the schedule that fed it

**Files:**
- Modify: `.github/workflows/ci.yml` — remove the `astro-peer-range` job (lines 75 to
  end of file) and the `schedule:` trigger with its comment (lines 8–14)

**Interfaces:**
- Consumes: nothing.
- Produces: a CI workflow with exactly two jobs, `biome` and `tests`.

- [ ] **Step 1: Remove the `schedule:` trigger and its comment**

Delete these lines from the `on:` block — the comment says outright that the schedule
exists to notice a new Astro major, and there is no Astro peer range left to watch:

```yaml
  # Astro ships majors quickly and the peer range has no upper bound, so a new
  # one is supported the day it lands whether or not anyone pushed here. This
  # is what notices when that stops being true.
  schedule:
    - cron: '0 3 * * 1'
```

- [ ] **Step 2: Remove the `astro-peer-range` job**

Delete from the comment beginning `# The published peer range is` through the end of
the file — the four-line comment, the `astro-peer-range:` key and all of its steps.

- [ ] **Step 3: Verify what is left**

```sh
grep -n "astro" .github/workflows/ci.yml          # expect no matches
grep -n "^  [a-z-]*:" .github/workflows/ci.yml    # expect only biome: and tests:
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs'])); print(sorted(d[True]))"
```

Expected: `['biome', 'tests']` and the triggers `['pull_request', 'push', 'workflow_dispatch']`.
(`d[True]` is not a typo — YAML parses the key `on` as the boolean `True`.)

If `python3 -c "import yaml"` fails, install it with `brew install libyaml && python3 -m pip install pyyaml`, or skip this line and rely on the two greps.

- [ ] **Step 4: Commit**

```sh
git add .github/workflows/ci.yml
git commit -m "ci: drop the Astro peer-range matrix

There is no Astro peer range left to prove. The weekly schedule goes with
it: its comment says plainly that watching for a new Astro major is the
only reason it existed."
```

---

### Task 5: Rewrite the documentation as a remark plugin

**Files:**
- Modify: `README.md` (227 lines — title, badges, `## Install`, `### Sites that declare
  markdown.processor`, and every `astro-affiliate-card` specifier throughout)
- Modify: `CLAUDE.md` (the intro line, the two Astro dependency bullets, the site count)
- Modify: `docs/DESIGN.md` (198 lines — title, `## Why`, `## Scope`, `## Package layout`,
  `## Integration`, `## Migration`)

**Interfaces:**
- Consumes: the package shape from Tasks 2–4.
- Produces: docs that describe a remark plugin. No task depends on their contents.

- [ ] **Step 1: README — title, badges and install**

Replace the title with `# remark-affiliate-card`. In the badge block, point the npm,
CI and license badges at the new name and repository, and **delete the
`astro >=4` badge** outright.

Rewrite `## Install` so the plain unified pipeline leads and Astro follows:

````markdown
## Install

```sh
bun add remark-affiliate-card remark-directive
```

Any unified pipeline can use it:

```js
import remarkDirective from 'remark-directive'
import remarkParse from 'remark-parse'
import affiliateCard from 'remark-affiliate-card'
import { unified } from 'unified'

unified().use(remarkParse).use(remarkDirective).use(affiliateCard, options)
```

`remark-directive` is yours to register: nothing parses `::amazon` on its own, and
without it the directive reaches the page as literal text. Sites that only convert
bare Amazon URLs (`bareUrls: true`) do not need it.

### With Astro

Astro 7's native Markdown processor runs no remark or rehype plugins, so a site whose
Markdown depends on them declares the unified processor itself. This is the shape
every site using this plugin is on:

```js
// astro.config.mjs
import { createRemarkAmazon } from 'remark-affiliate-card'

markdown: {
  processor: unified({
    remarkPlugins: [remarkDirective, createRemarkAmazon(), /* … */],
  }),
}
```

`createRemarkAmazon()` reads the product data and the credentials for you and returns
the `[plugin, options]` pair. Import the stylesheet yourself:

```css
@import "remark-affiliate-card/card.css";
```
````

- [ ] **Step 2: README — sweep the remaining specifiers**

```sh
sed -i '' \
  -e 's|astro-affiliate-card/card.css|remark-affiliate-card/card.css|g' \
  -e 's|astro-affiliate-card/remark|remark-affiliate-card|g' \
  -e 's|astro-affiliate-card|remark-affiliate-card|g' \
  README.md
grep -n "astro-affiliate-card" README.md   # expect no matches
```

Then read `## Configure` and `## Using the pieces directly` and fix by hand anything
the sweep left semantically wrong — in particular any sentence that still calls the
package an integration, and the `affiliateCard({ … })` example under `## Configure`,
which must become `createRemarkAmazon({ … })`.

- [ ] **Step 3: CLAUDE.md**

- Opening line: `Astro integration that renders …` → `remark plugin that renders
  Amazon / Rakuten / Yahoo! affiliate product cards.`
- `Four sites install it` → `Five sites install it (impreza-gdb, blog, zc33s, je1wfv,
  triathlon); a broken release breaks all five at once.`
- In `## Dependencies`, delete the peer-range bullet and the optional-astro-peer bullet
  and replace them with:

```markdown
- **Nothing here depends on Astro.** The only external runtime import in the
  package is `unist-util-visit`, in `dist/remark.js`; everything else is
  `node:fs` / `node:path`. The entry point default-exports the remark plugin.
  Astro sites are still the audience, but they consume it as a plugin through
  `createRemarkAmazon`, which is why there is no integration and no astro peer.
- `unified` and `@types/mdast` are runtime `dependencies`, not devDependencies:
  `dist/remark.d.ts` names both, so they have to reach a consumer's node_modules.
```

- In `## CI`, drop the sentence about typechecking against each Astro major.

- [ ] **Step 4: docs/DESIGN.md**

- Title → `# remark-affiliate-card — Design`
- `## Why` opening → `A remark plugin that renders Amazon / Rakuten / Yahoo! affiliate
  product cards.`
- `## Scope`: `the Astro integration` leaves the in-scope list.
- `## Package layout`: the `index.ts   Astro integration (default export)` line becomes
  `index.ts   Entry point: default-exports the remark plugin, re-exports the rest`.
- `## Integration`: retitle to `## Using it from Astro` and rewrite around
  `markdown.processor` + `createRemarkAmazon`. **Keep** the operational note that a
  plugin change needs `astro build --force`, since Astro caches rendered content —
  that is still true and still bites.
- `## Migration`: add a short paragraph at the top recording that the package was
  `astro-affiliate-card` through 0.4.1, and why the name changed.

- [ ] **Step 5: Verify no stale references remain**

```sh
grep -rn "astro-affiliate-card" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
```

Expected: matches only inside `docs/superpowers/` (the spec and this plan describe the
old name on purpose) and the `## Migration` paragraph just written.

- [ ] **Step 6: Commit**

```sh
git add README.md CLAUDE.md docs/DESIGN.md
git commit -m "docs: describe a remark plugin, not an Astro integration"
```

---

### Task 6: Publish 1.0.0

**Files:** none.

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: `remark-affiliate-card@1.0.0` on npm, a `v1.0.0` tag and a GitHub release,
  all pointing at the same commit. Task 7 installs it.

- [ ] **Step 1: HUMAN GATE — push the new repository**

Ask first. On approval:

```sh
git push -u origin main
```

- [ ] **Step 2: Wait for CI to go green**

```sh
gh run watch
```

Expected: `Biome` and `Tests` both pass. Nothing publishes over a red CI.

- [ ] **Step 3: HUMAN GATE — publish**

Ask first. `prepublishOnly` runs `lint:ci`, `typecheck`, `test:coverage` and `build`
before anything leaves the machine. Publish before cutting the release, so a failing
gate never leaves a GitHub release for a version npm does not have.

```sh
npm publish
```

The package is unscoped, so it publishes public by default — no `--access` flag.

- [ ] **Step 4: Cut the matching release**

```sh
npm view remark-affiliate-card version          # expect 1.0.0
gh release create v1.0.0 --target "$(git rev-parse HEAD)" --title v1.0.0 --generate-notes
```

- [ ] **Step 5: Replace the generated notes with real ones**

Every release in the old repository has hand-written notes; this one is the most
important of them. Cover: that this is `astro-affiliate-card` renamed, that the Astro
integration is gone and why nobody was using it, the three-line migration table from
the spec, and that `astro-affiliate-card@0.4.1` stays on npm for anyone who wants the
old integration.

- [ ] **Step 6: Verify the three are in step**

```sh
npm view remark-affiliate-card versions --json
gh release list
git tag --sort=v:refname
```

Expected: `["1.0.0"]`, one release `v1.0.0`, one tag `v1.0.0`.

---

### Task 7: Move all five sites, without pushing any of them

**Files:** per site — `package.json`, `bun.lock`, `astro.config.mjs`, the stylesheet,
and the prose references listed below.

**Interfaces:**
- Consumes: `remark-affiliate-card@1.0.0` from npm.
- Produces: five sites that build locally against it. Task 8 pushes them.

Exact locations found in the survey:

| Site | config | stylesheet | prose references |
|---|---|---|---|
| `impreza-gdb` | `astro.config.mjs:27` | `src/styles/global.css:762` | `src/styles/global.css:765` |
| `blog` | `astro.config.mjs:29` | `src/styles/app.css:35` | `scripts/validate-affiliate-buttons.mjs:4`, `.github/workflows/deploy.yml:73` |
| `zc33s` | `astro.config.mjs:28` | `src/styles/app.css:15` | — |
| `je1wfv` | `astro.config.mjs:12` | `src/styles/app.css:15` | — |
| `triathlon` | `astro.config.mjs:26` | `src/styles/app.css:16` | `.github/workflows/deploy.yml:68` |

Quote style differs between sites (`'…'` in impreza-gdb and je1wfv, `"…"` in the rest),
so sweep by specifier rather than by whole line.

- [ ] **Step 1: For each of the five sites, swap the dependency**

Run per site, from that site's directory. Using bun rather than editing `package.json`
by hand keeps the lockfile correct:

```sh
bun remove astro-affiliate-card
bun add remark-affiliate-card@^1.0.0
```

- [ ] **Step 2: For each site, sweep the specifiers**

The expression order matters: the `/card.css` and `/remark` suffixes have to be
rewritten before the bare name, or the suffix survives.

```sh
grep -rl "astro-affiliate-card" . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.astro \
  | xargs sed -i '' \
    -e 's|astro-affiliate-card/card.css|remark-affiliate-card/card.css|g' \
    -e 's|astro-affiliate-card/remark|remark-affiliate-card|g' \
    -e 's|astro-affiliate-card|remark-affiliate-card|g'
grep -rn "astro-affiliate-card" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
```

Expected: no matches on the second command.

- [ ] **Step 3: For each site, build it**

```sh
bun install
bun run build
```

Expected: a clean build. `astro build --force` if a stale cache is suspected — Astro
caches rendered Markdown, so a plugin swap can otherwise render from cache.

- [ ] **Step 4: On `blog`, run its own affiliate check**

```sh
node scripts/validate-affiliate-buttons.mjs
```

Expected: whatever it printed before the change. This is the one site with a bespoke
check that cards carry the right shop buttons.

- [ ] **Step 5: Confirm the rendered cards did not move**

No rendering code changed, so the output should be byte-identical. On one site, before
committing:

```sh
git stash && bun install && bun run build && cp -r dist /tmp/cards-before
git stash pop && bun install && bun run build && diff -r /tmp/cards-before dist
```

Expected: differences only where the build embeds hashed asset names, none inside the
card markup itself. If card markup changed, STOP and report — that contradicts the
design.

- [ ] **Step 6: THE GATE — all five must build before any is pushed**

Do not proceed to Task 8 until Steps 1–3 have passed on all five sites. This is the one
safety property the single-wave cutover keeps.

- [ ] **Step 7: Commit in each site (no push)**

```sh
git add -A
git commit -m "chore: move to remark-affiliate-card

astro-affiliate-card was renamed: nothing in it depended on Astro, and the
Astro integration it shipped was unused here -- this site already registered
the plugin through createRemarkAmazon."
```

---

### Task 8: Push the five sites

**Files:** none.

**Interfaces:**
- Consumes: Task 7's five local commits.
- Produces: five deployed sites on `remark-affiliate-card@1.0.0`.

- [ ] **Step 1: HUMAN GATE — push, one site at a time**

Ask first, per site. These are live blogs with their own deploy pipelines.

```sh
git push
```

- [ ] **Step 2: Watch each site's pipeline before starting the next**

```sh
gh run watch
```

Expected: green. If one fails, stop pushing the rest and report — four un-pushed sites
are four sites that still work.

- [ ] **Step 3: Spot-check one deployed page**

Open a post containing a card on the deployed site and confirm the card renders styled,
with its shop buttons. A missing stylesheet is the failure mode the `@import` sweep
would have caused, and it is invisible to the build.

---

### Task 9: Retire the old package and repository

**Files:**
- Modify: `README.md` in the **old** repository

**Interfaces:**
- Consumes: all five sites green from Task 8.
- Produces: a deprecated npm package and an archived repository, both pointing at the
  new one.

- [ ] **Step 1: HUMAN GATE — deprecate on npm**

Ask first. Only after every site is green.

```sh
npm deprecate astro-affiliate-card@"*" \
  "Renamed to remark-affiliate-card. Nothing in this package depended on Astro; see https://github.com/matsubo/remark-affiliate-card"
```

- [ ] **Step 2: Add the notice to the old README**

In the old repository, directly under the title:

```markdown
> **Renamed.** This package is now
> [`remark-affiliate-card`](https://github.com/matsubo/remark-affiliate-card).
> Nothing it shipped depended on Astro, so it is named for what it is: a remark
> plugin. `astro-affiliate-card@0.4.1` stays on npm and keeps working, including
> the Astro integration that the new package drops.
```

```sh
git add README.md
git commit -m "docs: point at remark-affiliate-card"
```

- [ ] **Step 3: HUMAN GATE — push the old repository**

Ask first. This push carries the four unreleased post-0.4.1 commits with it
(`1bd9962`, `c70cb12`, and the two spec/plan commits). That is intended: none of them
was published to npm under the old name, and leaving the repository behind its own
final state would be the less honest option.

```sh
git push
```

- [ ] **Step 4: HUMAN GATE — archive**

Ask first. Last, because it makes the repository read-only.

```sh
gh repo archive matsubo/astro-affiliate-card --yes
```

- [ ] **Step 5: Final verification**

```sh
npm view astro-affiliate-card deprecated
npm view remark-affiliate-card version
gh repo view matsubo/astro-affiliate-card --json isArchived -q .isArchived
```

Expected: the deprecation message, `1.0.0`, and `true`.
