// Product cache backed by the committed amazon-products.json itself.
//
// The output JSON is committed anyway, so it already survives across CI runs
// and needs no second store to drift out of sync — and no native dependency.
//
// Freshness rides along in a `fetchedAt` field on each record. The rendering
// side ignores fields it does not know about.

import { readFileSync } from 'node:fs'
import type { CreatorsProduct } from './parse.js'

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000

export interface ProductCache {
  /** The product, or null when absent, untitled or expired. */
  get(asin: string): CreatorsProduct | null
  /** Stores the product and returns the record as persisted. */
  set(asin: string, product: CreatorsProduct): CreatorsProduct
  /** Everything held so far, for writing back out. */
  entries(): Record<string, CreatorsProduct>
}

export function openJsonCache(
  jsonPath: string,
  { now = Date.now }: { now?: () => number } = {},
): ProductCache {
  let entries: Record<string, CreatorsProduct>
  try {
    entries = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Record<string, CreatorsProduct>
  } catch {
    // No cache yet, or it is unreadable. Refetching everything is correct and
    // self-healing; a parse error must not abort the run.
    entries = {}
  }

  return {
    get(asin) {
      const entry = entries[asin]
      if (!entry?.title || !entry.fetchedAt) return null
      if (now() - entry.fetchedAt >= CACHE_TTL_MS) return null
      return entry
    },

    set(asin, product) {
      const stored = { ...product, fetchedAt: now() }
      entries[asin] = stored
      return stored
    },

    entries() {
      return entries
    },
  }
}
