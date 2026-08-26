// Response parsing for the Creators API getItems operation.
//
// The API documents lowerCamelCase, but replies have been observed with
// PascalCase on some fields (a PA-API v5 inheritance). Every lookup here is
// case-insensitive, so a casing change on Amazon's side cannot silently blank
// out every product card.

const DESCRIPTION_MAX_LENGTH = 100

/** A product as persisted in amazon-products.json. */
export interface CreatorsProduct {
  title: string
  imageUrl: string
  price: string
  listPrice: string
  description: string
  rating: number
  reviewCount: number
  detailPageUrl: string
  brand: string
  model: string
  partNumber: string
  /** Set by the cache, not by the API. */
  fetchedAt?: number
}

/** Case-insensitive single-key lookup. */
function get(object: unknown, key: string): unknown {
  if (object === null || typeof object !== 'object') return undefined
  const record = object as Record<string, unknown>
  if (key in record) return record[key]
  const wanted = key.toLowerCase()
  const match = Object.keys(record).find((k) => k.toLowerCase() === wanted)
  return match === undefined ? undefined : record[match]
}

/** Case-insensitive nested lookup: dig(item, 'itemInfo', 'title', 'displayValue'). */
function dig(object: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>((current, key) => get(current, key), object)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function firstListing(item: unknown): unknown {
  const listings = dig(item, 'offersV2', 'listings')
  return Array.isArray(listings) ? listings[0] : undefined
}

function extractPrices(item: unknown): { price: string; listPrice: string } {
  const price = dig(firstListing(item), 'price')
  return {
    price: asString(dig(price, 'money', 'displayAmount')),
    listPrice: asString(dig(price, 'savingBasis', 'money', 'displayAmount')),
  }
}

function extractDescription(item: unknown): string {
  const features = dig(item, 'itemInfo', 'features', 'displayValues')
  const first = Array.isArray(features) ? features[0] : undefined
  return typeof first === 'string' ? first.substring(0, DESCRIPTION_MAX_LENGTH) : ''
}

function toProduct(item: unknown): CreatorsProduct | null {
  const title = asString(dig(item, 'itemInfo', 'title', 'displayValue'))
  const detailPageUrl = asString(dig(item, 'detailPageUrl'))

  // A card with no name or no link is worse than the fallback stub, which at
  // least renders a working affiliate link.
  if (!title || !detailPageUrl) return null

  const { price, listPrice } = extractPrices(item)

  return {
    title,
    imageUrl:
      asString(dig(item, 'images', 'primary', 'large', 'url')) ||
      asString(dig(item, 'images', 'primary', 'medium', 'url')),
    price,
    listPrice,
    description: extractDescription(item),
    rating: Number(dig(item, 'customerReviews', 'starRating', 'value')) || 0,
    reviewCount: Number(dig(item, 'customerReviews', 'count')) || 0,
    detailPageUrl,
    brand: asString(dig(item, 'itemInfo', 'byLineInfo', 'brand', 'displayValue')),
    model: asString(dig(item, 'itemInfo', 'manufactureInfo', 'model', 'displayValue')),
    partNumber: asString(
      dig(item, 'itemInfo', 'manufactureInfo', 'itemPartNumber', 'displayValue'),
    ),
  }
}

export interface GetItemsResult {
  products: Record<string, CreatorsProduct>
  errors: unknown[]
}

/**
 * Maps a getItems reply to `{ products, errors }`.
 *
 * getItems reports per-item problems in `errors` while still returning the
 * items it could resolve, so a single inaccessible ASIN must not discard the
 * rest of the batch.
 */
export function parseGetItemsResponse(response: unknown): GetItemsResult {
  const items = dig(response, 'itemsResult', 'items')
  const errors = dig(response, 'errors')

  const products: Record<string, CreatorsProduct> = {}
  for (const item of Array.isArray(items) ? items : []) {
    const asin = asString(dig(item, 'asin'))
    const product = toProduct(item)
    if (asin && product) products[asin] = product
  }

  return { products, errors: Array.isArray(errors) ? errors : [] }
}

/**
 * Picks the record to keep for an ASIN the API did not resolve.
 *
 * Products get delisted, and once that happens the API returns nothing for
 * them forever. If an earlier run captured a real title, keep it: replacing it
 * with a stub would blank out a product name that renders fine today. Only fall
 * back to the stub when we have never held anything better.
 */
export function resolveMissing(
  asin: string,
  previousProducts: Record<string, CreatorsProduct | undefined>,
  partnerTag: string,
): CreatorsProduct {
  const previous = previousProducts[asin]
  return previous?.title ? previous : fallbackProduct(asin, partnerTag)
}

/**
 * The record used when the API can tell us nothing about an ASIN.
 *
 * The affiliate link and the legacy image endpoint still work, so the card
 * degrades to "no title, no price" rather than disappearing.
 */
export function fallbackProduct(asin: string, partnerTag: string): CreatorsProduct {
  return {
    title: '',
    imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.09.MZZZZZZZ.jpg`,
    price: '',
    listPrice: '',
    description: '',
    rating: 0,
    reviewCount: 0,
    detailPageUrl: `https://www.amazon.co.jp/dp/${asin}?tag=${partnerTag}&linkCode=ogi&th=1&psc=1`,
    brand: '',
    model: '',
    partNumber: '',
  }
}
