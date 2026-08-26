# astro-affiliate-card

An Astro integration that renders Amazon product cards from a `::amazon`
directive, with optional Rakuten and Yahoo! Shopping links alongside.

```markdown
この記事で使ったジェルです。

::amazon{asin="B00TQMO5E0"}
```

<img width="835" height="324" alt="image" src="https://github.com/user-attachments/assets/39ddfbda-8fc9-42f7-bbd1-3c4bebb0a2d8" />


Product data comes from the Amazon Creators API, is committed to your
repository as JSON, and is refreshed with a CLI — so builds and deploys never
depend on the API being up.

## Install

```sh
bun add astro-affiliate-card
```

```js
// astro.config.mjs
import affiliateCard from 'astro-affiliate-card'

export default defineConfig({
  integrations: [affiliateCard()],
})
```

The integration registers the remark plugin and injects the stylesheet. Nothing
else to wire up.

### Sites that declare `markdown.processor`

Astro 7's native Markdown processor runs no remark or rehype plugins, so a site
whose Markdown depends on them declares the unified processor itself:

```js
import { createRemarkAmazon } from 'astro-affiliate-card/remark'

markdown: {
  processor: unified({
    remarkPlugins: [remarkDirective, createRemarkAmazon(), /* … */],
  }),
}
```

An integration cannot add to a list the site constructs, so `affiliateCard()`
does nothing useful there — the directives render as literal text, with no
error.

**Import the stylesheet yourself in this case.** `createRemarkAmazon()` is a
remark plugin; only the integration can inject CSS. Without this the cards
render unstyled:

```css
@import "astro-affiliate-card/card.css";
```

## Configure

```js
affiliateCard({
  dataFile: 'src/data/amazon-products.json',
  labels: {
    kicker: 'PR',          // overrides the brand; see Disclosure below
    cta: 'Amazonで見る',
    shopsLabel: '他で探す',
    showAsin: false,
    showDescription: false,
    frameClass: '',        // extra class on the card root, for your own skin
    linkClass: '',         // extra class on every anchor; see Styling below
  },
  bareUrls: false,         // also convert standalone Amazon URLs
  injectStyles: true,
})
```

Credentials come from `.env` or the environment:

| Variable | Required | Purpose |
| --- | --- | --- |
| `AMAZON_AFFILIATE_TAG` | yes | Associates tag on Amazon links |
| `AMAZON_CREATOR_CREDENTIAL_ID` | for `fetch` | Creators API credential |
| `AMAZON_CREATOR_SECRET` | for `fetch` | Creators API credential |
| `AMAZON_CREATOR_CREDENTIAL_VERSION` | no | defaults to `3.3` |
| `AMAZON_MARKETPLACE` | no | defaults to `www.amazon.co.jp` |
| `RAKUTEN_AFFILIATE_ID` | no | omit to hide the Rakuten button |
| `YAHOO_VC_SID` | no | ValueCommerce site id |
| `YAHOO_VC_PID` | no | ValueCommerce program id |

A shop with no credentials gets no button, rather than a link that goes
nowhere.

## Fetching product data

```sh
bunx affiliate-card fetch
```

Scans your posts for ASINs, asks the Creators API about the ones that are new
or older than 90 days, and writes `src/data/amazon-products.json`. Commit that
file: it is both the build's data source and its own cache.

```
--posts <dir>   posts to scan  (default src/content/posts)
--out <file>    product file   (default src/data/amazon-products.json)
--force         refetch everything, ignoring cache freshness
```

**An ASIN the API stops resolving keeps whatever was captured when it still
existed.** Products get delisted and never come back, and overwriting those
records with empty stubs would blank out cards that render perfectly well
today. A brand-new ASIN that cannot be resolved falls back to a plain
affiliate link.

The command exits non-zero only when *every* batch fails, which means a
credential or connectivity problem. Individual ASINs going missing is routine
and does not fail a build.

### Note on the API

This talks to the **Creators API**, not Product Advertising API v5 — Amazon
retired PA-API on 2026-05-15, and its access keys do not work here. Issue a
credential pair in Associates Central → Tools → Creators API.

The API does not return customer reviews: `customerReviews` comes back null,
so the card renders no star rating. It does return the brand, which the card
shows above the title.

## What the card shows

Image, brand, title, price, and a buy button — plus Rakuten and Yahoo! search
links when those are configured.

Deliberately absent by default:

- **The ASIN.** It identifies the product to Amazon, not to a reader.
- **The description.** Amazon's description is the same keyword-stuffed
  marketing copy as the title, so showing both doubles the noise.
- **A full-length title.** Amazon titles run past 100 characters of search
  terms; the card clamps to two lines so the price and the buy button stay
  above the fold.

Each is available through `labels` for a site that wants it.

## Disclosure

Japan's ステマ規制 requires advertising to be identifiable as advertising, and
affiliate placements fall under it. The card carries no disclosure by default,
because a site can equally disclose once per article — repeating it on every
card is the noisier of the two options.

If you want it on the card, set `labels: { kicker: 'PR' }`. If you disclose at
the article level instead, make sure something on the page actually says so.

## Styling

The stylesheet drives every colour, radius and font through an `--aff-*`
custom property, so you re-skin by overriding variables rather than forking
markup:

```css
.amazon-card {
  --aff-accent: #d2691e;
  --aff-radius: 0;
}
```

Dark mode follows your page's own marker — `.dark` or `[data-theme="dark"]` on
the root element. It deliberately does not use `prefers-color-scheme`: sites
that resolve an "auto" setting in JavaScript stamp the result on `<html>`, and
a media query would fight that and darken the card for a reader who had
explicitly chosen light.

If your site styles every `<a>` in prose, its rules will outrank this
package's. Rather than escalating specificity, pass your own escape-hatch
class:

```js
// for a site with `.custom-md a:not(.no-styling) { … }`
affiliateCard({ labels: { linkClass: 'no-styling' } })
```

## Bare Amazon URLs

Off by default. With `bareUrls: true`, a paragraph containing nothing but an
Amazon link becomes a card. A link inside a sentence stays a link.

It is opt-in because enabling it rewrites existing prose — that is a content
change, and it should be a decision rather than a surprise after an upgrade.

## Using the pieces directly

Every layer is exported, so you can render a card outside the remark pipeline:

```js
import { renderAmazonCard } from 'astro-affiliate-card/card'
import { resolveShopLinks } from 'astro-affiliate-card/shops'

const links = resolveShopLinks('メダリスト ジェル', { rakutenAffiliateId: '…' })
const html = renderAmazonCard({ url, title, price }, links)
```

`renderAmazonCard` and the URL builders are pure: credentials and text arrive
as arguments, never from the environment.

## License

MIT
