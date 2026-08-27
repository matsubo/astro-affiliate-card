// Shop URL construction. Every function here is pure: credentials arrive as
// arguments rather than being read from the environment, so the whole module
// is testable without any setup and the same call works in a build, a test, or
// a script.

/** Credentials for the non-Amazon shops. Omit one to hide its button. */
export interface ShopCredentials {
  /** Rakuten どこでもリンク affiliate id, e.g. "1d45d69e.d383737b…". */
  rakutenAffiliateId?: string | undefined
  /** ValueCommerce site id. */
  yahooVcSid?: string | undefined
  /** ValueCommerce program id. */
  yahooVcPid?: string | undefined
}

/** Referral links for the extra shop buttons; a null hides that button. */
export interface ShopLinks {
  rakutenUrl?: string | null
  yahooUrl?: string | null
  yahooBeaconUrl?: string | null
}

const ASIN_IN_PATH = /\/(dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/

/**
 * Pulls the ASIN out of an Amazon product URL.
 *
 * Short links (amzn.to) resolve server-side, so the ASIN is genuinely not
 * present in the URL and this returns null rather than guessing.
 */
export function extractAsin(url: string): string | null {
  return ASIN_IN_PATH.exec(url)?.[2] ?? null
}

// Anchored at the start and requiring the host to end at a slash, so that
// look-alikes such as amazonripoff.example.com do not match.
const AMAZON_HOST =
  /^https?:\/\/(www\.)?(amazon\.(com|co\.jp|co\.uk|de|fr|it|es|ca|com\.au|com\.br|com\.mx|in|nl|se|pl|sg|ae|sa)|amzn\.(to|asia))\//

export function isAmazonUrl(url: string): boolean {
  return AMAZON_HOST.test(url)
}

/**
 * Rakuten どこでもリンク referral pointing at an Ichiba search.
 *
 * A search rather than a product page: the sites carry Amazon ASINs, and there
 * is no reliable mapping from an ASIN to a Rakuten item id.
 */
export function buildRakutenSearchUrl(
  keyword: string,
  affiliateId: string | undefined,
): string | null {
  if (!keyword || !affiliateId) return null
  const searchUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}/`
  const encoded = encodeURIComponent(searchUrl)
  return `https://hb.afl.rakuten.co.jp/hgc/${affiliateId}/?pc=${encoded}&m=${encoded}`
}

/** ValueCommerce MyLink referral to a Yahoo! Shopping search. */
export function buildYahooSearchUrl(
  keyword: string,
  sid: string | undefined,
  pid: string | undefined,
): string | null {
  if (!keyword || !sid || !pid) return null
  const searchUrl = `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(keyword)}`
  return `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${sid}&pid=${pid}&vc_url=${encodeURIComponent(searchUrl)}`
}

/**
 * ValueCommerce 1x1 impression beacon.
 *
 * ValueCommerce requires this alongside a MyLink referral; without it the
 * impression goes unrecorded.
 */
export function buildYahooBeaconUrl(
  sid: string | undefined,
  pid: string | undefined,
): string | null {
  if (!sid || !pid) return null
  return `https://ad.jp.ap.valuecommerce.com/servlet/gifbanner?sid=${sid}&pid=${pid}`
}

/**
 * Condenses a keyword-stuffed Amazon title into something a shop search can
 * actually match.
 *
 * Amazon titles read like "【PS5対応】メーカー保証3年 BRAND 商品名 対応 A B C…".
 * Handed to Rakuten verbatim they over-specify the query into zero hits, so
 * the button lands the reader on an empty results page. Marketing segments in
 * 【】 go, and whole tokens are kept up to roughly 30 characters -- never
 * splitting one, since half a token matches nothing.
 */
export function condenseTitleKeyword(title: string): string {
  const tokens = title
    .replace(/【[^】]*】/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  let kept = tokens[0] ?? ''
  for (const token of tokens.slice(1)) {
    const candidate = `${kept} ${token}`
    if (candidate.length > 30) break
    kept = candidate
  }
  return kept
}

/**
 * Whether a partNumber/model value looks like a retail model code worth
 * searching a shop for.
 *
 * The Creators API also stuffs internal SKUs ("rtlsdr_only"), plain words
 * ("illustrations"), brand names ("ホルツ") and variant phrases
 * ("Flipside 300 (Black)") into those fields. Searching Rakuten for one of
 * those lands on zero results, which is worse than the title fallback, so
 * only values shaped like model codes get through.
 */
export function isSearchableModelCode(value: string | null | undefined): boolean {
  if (!value) return false
  const code = value.trim()
  if (!code || code.length > 24) return false
  // Underscores are SKU-speak; parentheses mark a colour or variant phrase.
  if (code.includes('_') || /[()（）]/.test(code)) return false
  // Real model codes are at most two tokens ("NW-E405 B"); more is a phrase.
  if (code.split(/\s+/).length > 2) return false
  // Non-ASCII values are brand or product words, not codes.
  if (!/^[\x20-\x7e]+$/.test(code)) return false
  // Without a digit it is usually a word; the exception is short dashed
  // all-caps codes like "TJB-SPT".
  if (!/\d/.test(code)) return /^[A-Z]+(?:-[A-Z]+)+$/.test(code)
  return true
}

/**
 * Picks what to search the other shops for.
 *
 * A part number or model is what actually identifies the product across
 * retailers; the title is a marketing string and only a last resort. An
 * explicit `kw` on the directive overrides all of it.
 */
export function deriveSearchKeyword({
  kw,
  product,
  title,
}: {
  kw?: string | undefined
  product?: { partNumber?: string | undefined; model?: string | undefined } | undefined
  title?: string | undefined
} = {}): string {
  if (kw) return kw
  const partNumber = product?.partNumber?.trim()
  if (partNumber && isSearchableModelCode(partNumber)) return partNumber
  const model = product?.model?.trim()
  if (model && isSearchableModelCode(model)) return model
  return title ? condenseTitleKeyword(title) : ''
}

/** Builds every shop link a set of credentials allows for one search keyword. */
export function resolveShopLinks(keyword: string, credentials: ShopCredentials): ShopLinks {
  return {
    rakutenUrl: buildRakutenSearchUrl(keyword, credentials.rakutenAffiliateId),
    yahooUrl: buildYahooSearchUrl(keyword, credentials.yahooVcSid, credentials.yahooVcPid),
    yahooBeaconUrl: buildYahooBeaconUrl(credentials.yahooVcSid, credentials.yahooVcPid),
  }
}
