// Reconciles the ASINs a site's posts use against its product file.
//
// Kept free of I/O so the rules that decide what survives a sync can be tested
// directly: the CLI supplies the file reading, writing and the real client.

import type { CreatorsClient } from './client.js'
import { type CreatorsProduct, resolveMissing } from './parse.js'
import { chunk, isSystemicFailure, MAX_ITEMS_PER_REQUEST } from './request.js'

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000

export interface SyncOptions {
  /** ASINs referenced by the posts. */
  asins: readonly string[]
  /** Current contents of amazon-products.json. */
  existing: Record<string, CreatorsProduct>
  client: CreatorsClient
  partnerTag: string
  now?: () => number
  /** Refetch everything, ignoring cache freshness. */
  force?: boolean
  log?: (message: string) => void
}

export interface SyncResult {
  products: Record<string, CreatorsProduct>
  cached: number
  fetched: number
  missing: string[]
  /** Every batch failed — a credential or connectivity problem, not delistings. */
  systemicFailure: boolean
}

function isFresh(entry: CreatorsProduct | undefined, now: number): boolean {
  return Boolean(entry?.title && entry.fetchedAt && now - entry.fetchedAt < CACHE_TTL_MS)
}

export async function syncProducts(options: SyncOptions): Promise<SyncResult> {
  const { asins, existing, client, partnerTag, now = Date.now, force = false, log } = options
  const timestamp = now()

  // Entries the posts no longer reference are carried over untouched. Pruning
  // them is a judgement call for a person, not a side effect of a sync.
  const products: Record<string, CreatorsProduct> = { ...existing }

  const toFetch: string[] = []
  let cached = 0

  for (const asin of asins) {
    if (!force && isFresh(existing[asin], timestamp)) {
      cached += 1
      continue
    }
    toFetch.push(asin)
  }

  log?.(`${cached} cached, ${toFetch.length} to fetch`)

  const batches = chunk(toFetch, MAX_ITEMS_PER_REQUEST)
  let batchFailures = 0
  let fetched = 0
  const missing: string[] = []

  for (const [index, batch] of batches.entries()) {
    let resolved: Record<string, CreatorsProduct> = {}
    try {
      const result = await client.getItems(batch)
      resolved = result.products
    } catch (error) {
      batchFailures += 1
      const reason = error instanceof Error ? error.message : String(error)
      log?.(`  batch ${index + 1}/${batches.length} failed: ${reason}`)
    }

    for (const asin of batch) {
      const product = resolved[asin]
      if (product) {
        products[asin] = { ...product, fetchedAt: timestamp }
        fetched += 1
      } else {
        // Delisted, inaccessible, or the whole batch failed. Either way, an
        // earlier good record beats overwriting it with a stub.
        products[asin] = resolveMissing(asin, existing, partnerTag)
        missing.push(asin)
      }
    }
  }

  return {
    products,
    cached,
    fetched,
    missing,
    systemicFailure: isSystemicFailure({ batchCount: batches.length, batchFailures }),
  }
}
