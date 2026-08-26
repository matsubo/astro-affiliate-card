/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import type { CreatorsProduct } from './parse.js'
import { syncProducts } from './sync.js'

const TAG = 'triathlon01-22'

function product(title: string): CreatorsProduct {
  return {
    title,
    imageUrl: 'https://m.media-amazon.com/images/I/51.jpg',
    price: '￥3,059',
    listPrice: '',
    description: '',
    rating: 4.3,
    reviewCount: 217,
    detailPageUrl: `https://www.amazon.co.jp/dp/X?tag=${TAG}`,
    brand: '',
    model: '',
    partNumber: '',
  }
}

/** A client that resolves the given ASINs and silently omits the rest. */
function clientResolving(resolvable: Record<string, CreatorsProduct>) {
  return {
    async getItems(asins: readonly string[]) {
      const products: Record<string, CreatorsProduct> = {}
      for (const asin of asins) {
        const hit = resolvable[asin]
        if (hit) products[asin] = hit
      }
      return { products, errors: [] }
    },
  }
}

describe('syncProducts', () => {
  test('fetches the ASINs the posts use', async () => {
    const result = await syncProducts({
      asins: ['B00TQMO5E0'],
      existing: {},
      client: clientResolving({ B00TQMO5E0: product('Mag-on ジェル') }),
      partnerTag: TAG,
      now: () => 1000,
    })
    expect(result.products.B00TQMO5E0?.title).toBe('Mag-on ジェル')
    expect(result.fetched).toBe(1)
  })

  // triathlon has ten ASINs the API no longer returns, one of which is on a
  // live card. Replacing them with stubs would blank those cards out.
  test('keeps a previously captured product the API can no longer resolve', async () => {
    // Stale, so the sync does try to refresh it -- and gets nothing back.
    const existing = { B003ER7K0E: { ...product('塩熱サプリ'), fetchedAt: 0 } }
    const result = await syncProducts({
      asins: ['B003ER7K0E'],
      existing,
      client: clientResolving({}),
      partnerTag: TAG,
      now: () => 91 * 24 * 60 * 60 * 1000,
    })
    expect(result.products.B003ER7K0E?.title).toBe('塩熱サプリ')
    expect(result.missing).toEqual(['B003ER7K0E'])
  })

  test('falls back to a plain affiliate link for an ASIN never resolved', async () => {
    const result = await syncProducts({
      asins: ['B0NEWNEW00'],
      existing: {},
      client: clientResolving({}),
      partnerTag: TAG,
      now: () => 1000,
    })
    const record = result.products.B0NEWNEW00
    expect(record?.title).toBe('')
    expect(record?.detailPageUrl).toContain('B0NEWNEW00')
    expect(record?.detailPageUrl).toContain(`tag=${TAG}`)
  })

  // An ASIN no post references any more is still someone's data; dropping it
  // is a decision for a human, not a side effect of a sync.
  test('never drops an entry that the posts no longer reference', async () => {
    const existing = { B0OLDOLD00: { ...product('過去に載せた商品'), fetchedAt: 1 } }
    const result = await syncProducts({
      asins: [],
      existing,
      client: clientResolving({}),
      partnerTag: TAG,
      now: () => 1000,
    })
    expect(result.products.B0OLDOLD00?.title).toBe('過去に載せた商品')
  })

  test('reuses a fresh cache entry instead of calling the API', async () => {
    let calls = 0
    const client = {
      async getItems(asins: readonly string[]) {
        calls += 1
        return { products: { [asins[0]!]: product('fresh from api') }, errors: [] }
      },
    }
    const existing = { B00TQMO5E0: { ...product('cached'), fetchedAt: 1000 } }
    const result = await syncProducts({
      asins: ['B00TQMO5E0'],
      existing,
      client,
      partnerTag: TAG,
      now: () => 1000,
    })
    expect(calls).toBe(0)
    expect(result.products.B00TQMO5E0?.title).toBe('cached')
    expect(result.cached).toBe(1)
  })

  test('refetches an entry older than the cache lifetime', async () => {
    const ninetyOneDays = 91 * 24 * 60 * 60 * 1000
    const existing = { B00TQMO5E0: { ...product('stale'), fetchedAt: 0 } }
    const result = await syncProducts({
      asins: ['B00TQMO5E0'],
      existing,
      client: clientResolving({ B00TQMO5E0: product('refreshed') }),
      partnerTag: TAG,
      now: () => ninetyOneDays,
    })
    expect(result.products.B00TQMO5E0?.title).toBe('refreshed')
  })

  test('batches requests at the API limit of ten', async () => {
    const batches: number[] = []
    const client = {
      async getItems(asins: readonly string[]) {
        batches.push(asins.length)
        return { products: {}, errors: [] }
      },
    }
    const asins = Array.from({ length: 23 }, (_, i) => `B${String(i).padStart(9, '0')}`)
    await syncProducts({ asins, existing: {}, client, partnerTag: TAG, now: () => 1000 })
    expect(batches).toEqual([10, 10, 3])
  })

  // A dead credential fails every batch; that must not be mistaken for
  // "every product was delisted" and quietly written out as stubs.
  test('reports a systemic failure when every batch fails', async () => {
    const client = {
      async getItems() {
        throw new Error('HTTP 401')
      },
    }
    const result = await syncProducts({
      asins: ['B00TQMO5E0', 'B003ER7K0E'],
      existing: {},
      client,
      partnerTag: TAG,
      now: () => 1000,
    })
    expect(result.systemicFailure).toBe(true)
  })

  test('does not call the API at all when nothing needs fetching', async () => {
    let calls = 0
    const client = {
      async getItems() {
        calls += 1
        return { products: {}, errors: [] }
      },
    }
    const result = await syncProducts({
      asins: [],
      existing: {},
      client,
      partnerTag: TAG,
      now: () => 1000,
    })
    expect(calls).toBe(0)
    expect(result.systemicFailure).toBe(false)
  })
})
