/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import { buildGetItemsBody, chunk, isSystemicFailure, MAX_ITEMS_PER_REQUEST } from './request.js'

describe('chunk', () => {
  test('splits into batches of the given size, remainder last', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })

  test('leaves an exact multiple without a trailing empty batch', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  test('yields no batches for an empty input', () => {
    expect(chunk([], MAX_ITEMS_PER_REQUEST)).toEqual([])
  })

  test('does not mutate the input', () => {
    const items = [1, 2, 3]
    chunk(items, 2)
    expect(items).toEqual([1, 2, 3])
  })
})

describe('isSystemicFailure', () => {
  // A dead credential fails every batch; that must not be mistaken for
  // "every product was delisted".
  test('is true only when every batch failed', () => {
    expect(isSystemicFailure({ batchCount: 3, batchFailures: 3 })).toBe(true)
  })

  test('is false when some batches got through', () => {
    expect(isSystemicFailure({ batchCount: 3, batchFailures: 2 })).toBe(false)
    expect(isSystemicFailure({ batchCount: 3, batchFailures: 0 })).toBe(false)
  })

  // Nothing to fetch is a successful no-op, not a failure worth a non-zero exit.
  test('is false when there was nothing to do', () => {
    expect(isSystemicFailure({ batchCount: 0, batchFailures: 0 })).toBe(false)
  })
})

describe('buildGetItemsBody', () => {
  const options = { partnerTag: 'triathlon01-22', marketplace: 'www.amazon.co.jp' }

  test('addresses the ASINs to the configured partner and store', () => {
    const body = buildGetItemsBody(['B00TQMO5E0', 'B003ER7K0E'], options)
    expect(body).toMatchObject({
      itemIds: ['B00TQMO5E0', 'B003ER7K0E'],
      itemIdType: 'ASIN',
      partnerTag: 'triathlon01-22',
      partnerType: 'Associates',
      marketplace: 'www.amazon.co.jp',
    })
  })

  // Pricing moved from `offers.*` to `offersV2.*` when Amazon retired Offers V1
  // on 2026-01-31; asking for the old resource fails the whole request.
  test('asks for the fields the card renders, and prices from offersV2', () => {
    const resources = buildGetItemsBody(['B00TQMO5E0'], options).resources as string[]
    expect(resources).toContain('itemInfo.title')
    expect(resources).toContain('offersV2.listings.price')
    expect(resources).not.toContain('offers.listings.price')
  })

  test('copies its inputs, so a caller cannot reach the shared resource list', () => {
    const asins = ['B00TQMO5E0']
    const body = buildGetItemsBody(asins, options)
    ;(body.itemIds as string[]).push('B0MUTATED0')
    ;(body.resources as string[]).length = 0
    expect(asins).toEqual(['B00TQMO5E0'])
    expect((buildGetItemsBody(asins, options).resources as string[]).length).toBeGreaterThan(0)
  })
})
