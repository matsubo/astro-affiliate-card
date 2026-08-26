# astro-affiliate-card — Design

An Astro integration that renders Amazon / Rakuten / Yahoo! affiliate product
cards, shared by `zc33s`, `triathlon`, `blog` and `impreza-gdb`.

## Why

The card is currently copy-pasted across four repositories and has drifted:

| Repo | Card renderer | Shop buttons | Data client |
| --- | --- | --- | --- |
| `zc33s` | `rehype-component-amazon.mjs`, 240 lines | Amazon + Rakuten + Yahoo! | `amazon-creators`, 7 files (2026-07-29) |
| `triathlon` | `rehype-component-amazon.mjs`, 155 lines | Amazon only | `amazon-creators`, 7 files (2026-07-17) |
| `blog` | `rehype-component-amazon.mjs`, 277 lines | — | `amazon-creators`, 8 files (2026-08-24, newest) |
| `impreza-gdb` | `amazon-card.ts` + `remark-amazon.ts` | Amazon + Rakuten + Yahoo! | `amazon-creators`, 4 files (TypeScript) |

Four copies of the renderer and four of the API client. A fix to one never
reaches the others, and only two sites ever gained Rakuten/Yahoo! buttons.

Total cards in use: 1,451 (zc33s 726, triathlon 432, blog 242, impreza-gdb 51).

## Scope

In scope: card rendering, shop URL construction, the Astro integration, the
shipped stylesheet, and the Creators API client plus its sync CLI.

Out of scope: anything resembling `build-amazon-products.mjs`, the destructive
rebuild that triathlon's docs explicitly warn against. The sync CLI only ever
adds to and refreshes the product file — never rebuilds it from scratch.

## The API is Creators, not PA-API

Verified from the endpoints rather than the names: the client authenticates
against `creatorsapi.auth.<region>.amazoncognito.com/oauth2/token` and
`api.amazon.<tld>/auth/o2/token` — OAuth2 via Cognito. PA-API v5 would sign
requests with AWS4-HMAC, which appears nowhere.

`triathlon/docs/operations/amazon-affiliate-workflow.md` still calls this
"Amazon PA-API". That doc is stale and should be corrected during migration.

Access tokens live about an hour and are cached in memory for the process
lifetime. Nothing is persisted to disk, so the package needs no token state.

## Package layout

```
src/
  index.ts      Astro integration (default export)
  card.ts       renderAmazonCard() and its types
  shops.ts      Rakuten / Yahoo! / beacon URL builders (pure)
  remark.ts     ::amazon directive -> card HTML
  creators/     Creators API client, ported from blog's newest copy
  card.css      shipped stylesheet
bin/
  fetch.ts      product data sync CLI
```

`card.ts` and `shops.ts` stay pure: they take credentials and text as
arguments and never read `process.env`. Only `index.ts` and `bin/fetch.ts`
touch the environment. That keeps the rendering path testable without any
environment setup.

## Data model

Each repository keeps its own `src/data/amazon-products.json`, committed to
git, and syncs it with `bunx affiliate-card fetch`. The package owns the
fetching logic; the repository owns the data.

This deliberately moves `impreza-gdb` off build-time fetching. Its cards are
currently resolved during the build from a `better-sqlite3` cache, which
means every deploy needs API credentials, network access, and a working
native module. Committing the JSON instead:

- keeps deploys hermetic — `triathlon` and the others deploy from GitHub
  Actions, where a failed API call would break a release;
- keeps `better-sqlite3`, a native dependency, out of a package that four
  repositories install;
- matches what three of the four repositories already do.

The sync CLI **must preserve existing entries**. `triathlon` has ten ASINs
that the Creators API no longer returns (`B003ER7K0E` among them, used on a
live card) which render only from previously cached data. Dropping unresolved
ASINs would silently blank those cards, so a failed lookup keeps the old entry
and, for a genuinely new ASIN, falls back to a plain affiliate link.

## Theming

The markup follows `impreza-gdb`'s BEM structure, with its site-specific
coupling removed: no `hud-frame` / `hud-label` classes, and no
`// PARTS REGISTRY` kicker — a parts registry means nothing on a triathlon
blog.

Everything that reads as site voice becomes an option with a neutral Japanese
default: the kicker, the shop-section label, and the CTA text. `impreza-gdb`
passes its own strings at migration time to keep its current wording.

The `PR` kicker stays on by default. It is the ステマ規制 disclosure, not
decoration, and a site should have to opt out deliberately.

The stylesheet drives colours, fonts, radii and spacing from custom
properties, so a site re-skins the card by overriding variables rather than
by forking the markup. That is how one shared stylesheet and four distinct
site identities coexist.

## Integration

```js
import affiliateCard from 'astro-affiliate-card'

export default defineConfig({
  integrations: [affiliateCard({ dataFile: 'src/data/amazon-products.json' })],
})
```

The integration registers the remark plugin and injects the stylesheet.

One mechanic needs verifying in a fixture rather than assumed: `impreza-gdb`'s
plugin carries a comment that it "must precede remarkUnknownDirectives, which
flattens unhandled directives to text". Whether a plugin added through
`updateConfig` lands before a repository's own directive handlers is Astro
ordering semantics, so it gets a test. If ordering cannot be guaranteed, the
package also exports the remark plugin for explicit placement — two lines of
configuration per repository instead of one is an acceptable price.

Bare Amazon URLs are **not** auto-converted by default. `impreza-gdb` does
this today, but enabling it everywhere would silently turn existing Amazon
links in three sites' articles into cards. It becomes an opt-in flag.

## Environment contract

```
AMAZON_AFFILIATE_TAG              affiliate tag for Amazon links
AMAZON_CREATOR_CREDENTIAL_ID      Creators API credential
AMAZON_CREATOR_SECRET             Creators API credential
AMAZON_CREATOR_CREDENTIAL_VERSION optional, defaults to 3.3
AMAZON_MARKETPLACE                optional, defaults to www.amazon.co.jp
RAKUTEN_AFFILIATE_ID              omit to hide the Rakuten button
YAHOO_VC_SID                      omit to hide the Yahoo! button
YAHOO_VC_PID                      omit to hide the Yahoo! button
```

A missing shop credential hides that button rather than rendering a broken
link. `triathlon` currently reads `PUBLIC_AMAZON_AFFILIATE_TAG`, which is
unset — it works only because the hardcoded fallback happens to equal the
real tag. That dead read goes away with the migration.

## Migration

Fewest cards first, so a mistake is cheapest where it is most likely:

1. **impreza-gdb** (51 cards) — the pilot, consumed via `file:` link before
   anything is published. Doubles as the end-to-end test of the sync CLI,
   since it generates its first `amazon-products.json`.
2. Publish to npm. This is a user action; the account is not currently
   logged in.
3. **blog** (242) → **triathlon** (432) → **zc33s** (726), pinned to the
   published version.

Per repository: drop the `amazon:` entry from the rehype components map
(keeping `remark-directive`), delete the old renderer and `amazon-creators`
copy, and add the integration.

Article syntax does not change. `::amazon{asin="..."}` keeps working, so no
content is rewritten — only the generated HTML and CSS change.

Each step verifies that the built card count and affiliate tags match what
the site produced before.

## Testing

`impreza-gdb`'s 18 existing tests are the starting point, ported and adjusted
for the neutralized strings. Beyond them, the cases that matter are the ones
that would silently cost money or break pages:

- a sync that cannot resolve an ASIN keeps the existing entry;
- missing product data falls back to a plain affiliate link;
- each shop button disappears when its credential is absent;
- HTML escaping of every interpolated field;
- remark plugin ordering against a repository's own directive handlers.
