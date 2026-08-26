// Request construction for the Creators API catalog operations.
//
// Field names are lowerCamelCase (PA-API v5 used PascalCase), and pricing moved
// from `offers.*` to `offersV2.*` when Amazon retired Offers V1 on 2026-01-31.

export const GET_ITEMS_PATH = '/catalog/v1/getItems'

/** getItems accepts at most 10 ASINs per call. */
export const MAX_ITEMS_PER_REQUEST = 10

/** Only what the card renders — every extra resource is another failure surface. */
const RESOURCES = Object.freeze([
  'itemInfo.title',
  'itemInfo.features',
  // Brand and part/model numbers feed the Rakuten / Yahoo! search buttons.
  'itemInfo.byLineInfo',
  'itemInfo.manufactureInfo',
  'images.primary.large',
  'images.primary.medium',
  'customerReviews.starRating',
  'customerReviews.count',
  'offersV2.listings.price',
])

/** Splits items into batches of at most `size`, without mutating the input. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

/**
 * Decides whether a run should fail the process.
 *
 * Individual ASINs going missing is routine — products get delisted, and the
 * API reports those per item while the batch itself succeeds. A credential or
 * connectivity problem instead takes down every batch, and that is worth a
 * non-zero exit so a scheduled workflow surfaces it.
 */
export function isSystemicFailure({
  batchCount,
  batchFailures,
}: {
  batchCount: number
  batchFailures: number
}): boolean {
  return batchCount > 0 && batchFailures === batchCount
}

export function buildGetItemsBody(
  asins: readonly string[],
  { partnerTag, marketplace }: { partnerTag: string; marketplace: string },
): Record<string, unknown> {
  return {
    itemIds: [...asins],
    itemIdType: 'ASIN',
    partnerTag,
    partnerType: 'Associates',
    marketplace,
    resources: [...RESOURCES],
  }
}
