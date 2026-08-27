# Renaming to remark-affiliate-card — Design

**Date:** 2026-08-27
**Status:** approved, not yet executed

## Why

The package is named `astro-affiliate-card`, but nothing it ships depends on
Astro:

- `dist/index.js` never imports astro. `import type { AstroIntegration }` erases
  at build, and the integration it returns is a duck-typed object.
- The only external runtime import in the whole package is `unist-util-visit`,
  in `dist/remark.js`. Everything else is `node:fs` / `node:path`.
- Only `dist/index.d.ts` names astro at all.

What it actually is, precisely, is a **remark plugin**: it visits an mdast tree
and replaces `::amazon` leaf directives (and, optionally, bare Amazon URLs) with
card markup. The unified ecosystem names those `remark-*`, and that convention is
how they are found.

The name also costs nothing to change on the Astro side. Astro's integrations
catalogue is driven by the `astro-integration` npm keyword, not by the package
name — and after this change the package is no longer an integration, so it
should not carry that keyword either way.

## Decisions taken

Three questions were settled before this design:

1. **The Astro integration is dropped, not relocated.** All five consuming sites
   declare `markdown.processor` themselves and register the plugin through
   `createRemarkAmazon`; none imports the default export. Astro 7's native
   Markdown processor runs no remark plugins, which is why they all moved. The
   integration's only mechanism — `updateConfig({ markdown: { remarkPlugins } })`
   — is therefore a no-op on the Astro version every consumer is on. Keeping it
   would mean keeping the astro peer dependency, the five-job `astro-peer-range`
   matrix, and the `logger.info` workaround in `index.ts`, all to serve nobody.
   Anyone on Astro 4–6 who wants the integration still has
   `astro-affiliate-card@0.4.1` on npm, permanently.
2. **Git history carries over.** This repository records decisions in its commit
   messages that the code alone does not explain (3d6347f on which `partNumber`
   values are junk is the clearest case), and CLAUDE.md tells the reader to
   consult them. The new repository is a clone, not an `init`.
3. **The Amazon-named symbols stay.** `remarkAmazon`, `createRemarkAmazon`,
   `renderAmazonCard`, `AmazonCardData` are accurate: the primary key is an ASIN,
   the data source is the Amazon Creators API, and the Rakuten and Yahoo! links
   are search URLs derived from that Amazon product. Renaming them to
   `affiliate` would claim a generality the data model does not have. The
   `::amazon` directive name is fixed for the same reason, and because changing
   it would rewrite Markdown across five sites' entire post histories.

## Cutover: one wave

Chosen over a staged rollout. The sequence is:

new repository → restructure → publish 1.0.0 → migrate all five sites →
deprecate the old package → archive the old repository.

The risk of moving five production blogs together is real, so the wave has one
gate: **every site's `bun install && bun run build` must pass locally before any
site is pushed.** Nothing reaches a deploy pipeline until all five build against
the published 1.0.0.

## The new package

| | |
|---|---|
| Name | `remark-affiliate-card` |
| Version | `1.0.0` |
| Repository | `matsubo/remark-affiliate-card`, public, full history |
| `.` | the remark plugin — `default` is `remarkAmazon`; `createRemarkAmazon` and the card/shops helpers are named exports |
| `./card`, `./shops`, `./card.css` | unchanged |
| `./remark` | removed — `.` is the plugin now |
| `bin` | `affiliate-card`, unchanged |

### Source changes

- `src/index.ts` — the Astro integration is deleted. What remains is a barrel
  whose default export is the plugin:

  ```ts
  export { renderAmazonCard } from './card.js'
  export type { AmazonCardData, CardLabels } from './card.js'
  export type { AffiliateCardOptions } from './options.js'
  export {
    createRemarkAmazon,
    remarkAmazon,
    remarkAmazon as default,
    type ProductRecord,
    type RemarkAmazonOptions,
  } from './remark.js'
  export * from './shops.js'
  ```

  `IntegrationOptions` goes with it.
- `src/index.test.ts` — the integration tests are deleted and replaced by tests
  over the barrel: the default export is the plugin, and each named export is
  reachable. `bunfig.toml` enforces coverage per file, so the barrel needs a test
  of its own or the run goes red.
- `src/options.ts`, `src/remark.ts`, `src/card.ts`, `src/shops.ts`,
  `src/creators/**`, `src/bin/**` — no behaviour changes. The comment in
  `options.ts` explaining why `.env` is read directly is reworded: the reason is
  that a config-time plugin runs before any bundler injects env, not that Astro
  specifically does so.

### package.json

- `name`, `version` (`1.0.0`), `description`, `repository` updated.
- `keywords`: drop `astro-integration` — listing a non-integration in Astro's
  catalogue would be wrong. Add `remark`, `remark-plugin`, `unified`, `mdast`,
  `markdown`. Keep plain `astro` alongside `affiliate`, `amazon`, `rakuten`,
  `yahoo`: Astro sites are still the audience, they just consume it as a remark
  plugin.
- `exports`: drop `./remark`.
- `peerDependencies`: `astro` removed entirely, along with its
  `peerDependenciesMeta` entry. `remark-directive` stays an optional peer.
- `devDependencies`: `astro` removed.
- `dependencies`: unchanged — `@types/mdast`, `unified`, `unist-util-visit`,
  as corrected in c70cb12.

### CI

- The `astro-peer-range` job is deleted.
- The `schedule:` trigger goes with it. Its comment says plainly that it exists
  to notice a new Astro major; with no Astro peer range there is nothing for a
  weekly run to catch.
- `biome` and `tests` are unchanged.

### Docs

- `README.md` — retitled and rewritten as a remark plugin. Badges point at the
  new npm name and the new repository; the `astro >=4` badge is dropped. Usage
  leads with a plain unified/remark pipeline, then shows Astro
  (`markdown.processor`, the shape all five sites already use) as the worked
  example.
- `CLAUDE.md` — the Astro peer-range and optional-peer bullets are replaced by
  the rename's rationale; "Four sites install it" becomes the five sites, named;
  the release invariant is unchanged and tags in the new repository start at
  `v1.0.0`.
- `docs/DESIGN.md` — the title, scope paragraph, the `index.ts` line in the file
  map, and the Astro-integration sections are rewritten. The Astro-specific
  operational notes worth keeping (a plugin change needs `astro build --force`)
  move into the Astro section rather than being deleted.

## Migration, per site

All five sites take the same three-line change:

| File | From | To |
|---|---|---|
| `package.json` | `"astro-affiliate-card": "^0.4.x"` | `"remark-affiliate-card": "^1.0.0"` |
| `astro.config.mjs` | `from 'astro-affiliate-card/remark'` | `from 'remark-affiliate-card'` |
| `src/styles/*.css` | `@import "astro-affiliate-card/card.css"` | `@import "remark-affiliate-card/card.css"` |

Sites: `impreza-gdb`, `blog`, `zc33s`, `je1wfv`, `triathlon`.

Also update the prose references to the old name, which are comments rather than
code: `blog/.github/workflows/deploy.yml`, `triathlon/.github/workflows/deploy.yml`,
`impreza-gdb/src/styles/global.css`, `blog/scripts/validate-affiliate-buttons.mjs`.

`je1wfv` is the only site that runs the CLI (`"fetch-amazon": "affiliate-card
fetch"`). The bin name does not change, so that script does not either.

## Retiring the old package

Only after all five sites are green:

- `npm deprecate astro-affiliate-card@"*" "Renamed to remark-affiliate-card."`
  The published 0.x versions stay installable. Neither commit made after 0.4.1
  is ever released under the old name: the dependency-declaration fix (c70cb12)
  ships in 1.0.0, and making the astro peer optional is superseded outright,
  since 1.0.0 has no astro peer to mark.
- `matsubo/astro-affiliate-card` gets a README notice pointing at the new
  repository, then `gh repo archive`. Archiving is last because it makes the
  repository read-only.

## Testing

- Package: the existing 185 tests carry over unchanged except for
  `src/index.test.ts`. `bun run test:coverage` must stay at the per-file gate,
  and `bun run lint:ci`, `bun run typecheck` and `bun run build` must pass —
  `prepublishOnly` runs all four before the publish anyway.
- Sites: `bun install && bun run build` locally for each of the five, against
  the published 1.0.0, before any push. `blog` additionally runs
  `scripts/validate-affiliate-buttons.mjs`.
- A rendered-output check on one site: the cards in a built page should be
  byte-identical to what 0.4.1 produced, since no rendering code changes.

## Things that need a human at the time

Each of these is a separate explicit go-ahead, not covered by approving this
design:

- every `git push`, in the new repository and in all five sites
- `npm publish` of `remark-affiliate-card@1.0.0`
- `npm deprecate` of `astro-affiliate-card`
- `gh repo archive` of the old repository

The npm name is currently free but is not reserved until the first publish.
