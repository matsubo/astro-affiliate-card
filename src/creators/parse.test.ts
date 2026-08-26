/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import { fallbackProduct, parseGetItemsResponse, resolveMissing } from './parse.js'

const TAG = 'triathlon01-22'

/** A getItems reply in the casing Amazon documents. */
const camelCaseItem = {
  asin: 'B00TQMO5E0',
  detailPageUrl: `https://www.amazon.co.jp/dp/B00TQMO5E0?tag=${TAG}`,
  itemInfo: {
    title: { displayValue: 'Mag-on エナジージェル' },
    features: { displayValues: ['マグネシウムを配合したエナジージェル'] },
    byLineInfo: { brand: { displayValue: 'Mag-on' } },
    manufactureInfo: {
      model: { displayValue: 'MG-12' },
      itemPartNumber: { displayValue: 'MGP-001' },
    },
  },
  images: { primary: { large: { url: 'https://m.media-amazon.com/images/I/51-large.jpg' } } },
  customerReviews: { starRating: { value: 4.3 }, count: 217 },
  offersV2: {
    listings: [
      {
        price: {
          money: { displayAmount: '￥3,059' },
          savingBasis: { money: { displayAmount: '￥3,500' } },
        },
      },
    ],
  },
}

/** The same reply with PA-API v5 style PascalCase, which has been seen in the wild. */
const pascalCaseItem = {
  ASIN: 'B00TQMO5E0',
  DetailPageURL: `https://www.amazon.co.jp/dp/B00TQMO5E0?tag=${TAG}`,
  ItemInfo: {
    Title: { DisplayValue: 'Mag-on エナジージェル' },
    Features: { DisplayValues: ['マグネシウムを配合したエナジージェル'] },
    ByLineInfo: { Brand: { DisplayValue: 'Mag-on' } },
    ManufactureInfo: {
      Model: { DisplayValue: 'MG-12' },
      ItemPartNumber: { DisplayValue: 'MGP-001' },
    },
  },
  Images: { Primary: { Large: { URL: 'https://m.media-amazon.com/images/I/51-large.jpg' } } },
  CustomerReviews: { StarRating: { Value: 4.3 }, Count: 217 },
  OffersV2: {
    Listings: [
      {
        Price: {
          Money: { DisplayAmount: '￥3,059' },
          SavingBasis: { Money: { DisplayAmount: '￥3,500' } },
        },
      },
    ],
  },
}

describe('parseGetItemsResponse', () => {
  test('maps every field the card renders', () => {
    const { products } = parseGetItemsResponse({ itemsResult: { items: [camelCaseItem] } })
    expect(products.B00TQMO5E0).toEqual({
      title: 'Mag-on エナジージェル',
      imageUrl: 'https://m.media-amazon.com/images/I/51-large.jpg',
      price: '￥3,059',
      listPrice: '￥3,500',
      description: 'マグネシウムを配合したエナジージェル',
      rating: 4.3,
      reviewCount: 217,
      detailPageUrl: `https://www.amazon.co.jp/dp/B00TQMO5E0?tag=${TAG}`,
      brand: 'Mag-on',
      model: 'MG-12',
      partNumber: 'MGP-001',
    })
  })

  // The whole reason every lookup in parse.ts is case-insensitive: a casing
  // change on Amazon's side must not silently blank out every product card.
  test('reads a PascalCase reply identically to a camelCase one', () => {
    const camel = parseGetItemsResponse({ itemsResult: { items: [camelCaseItem] } })
    const pascal = parseGetItemsResponse({ ItemsResult: { Items: [pascalCaseItem] } })
    expect(pascal.products).toEqual(camel.products)
  })

  test('falls back to the medium image when there is no large one', () => {
    const item = {
      ...camelCaseItem,
      images: { primary: { medium: { url: 'https://m.media-amazon.com/images/I/51-medium.jpg' } } },
    }
    const { products } = parseGetItemsResponse({ itemsResult: { items: [item] } })
    expect(products.B00TQMO5E0?.imageUrl).toBe('https://m.media-amazon.com/images/I/51-medium.jpg')
  })

  // A card with no name or no link is worse than the fallback stub, which at
  // least renders a working affiliate link.
  test('drops an item with no title', () => {
    const item = { ...camelCaseItem, itemInfo: { title: { displayValue: '' } } }
    const { products } = parseGetItemsResponse({ itemsResult: { items: [item] } })
    expect(products).toEqual({})
  })

  test('drops an item with no detail page URL', () => {
    const item = { ...camelCaseItem, detailPageUrl: undefined }
    const { products } = parseGetItemsResponse({ itemsResult: { items: [item] } })
    expect(products).toEqual({})
  })

  test('drops an item with no ASIN to key it by', () => {
    const item = { ...camelCaseItem, asin: undefined }
    const { products } = parseGetItemsResponse({ itemsResult: { items: [item] } })
    expect(products).toEqual({})
  })

  test('leaves prices empty when the listing carries none', () => {
    const item = { ...camelCaseItem, offersV2: undefined }
    const { products } = parseGetItemsResponse({ itemsResult: { items: [item] } })
    expect(products.B00TQMO5E0?.price).toBe('')
    expect(products.B00TQMO5E0?.listPrice).toBe('')
  })

  test('reads the price from the first listing only', () => {
    const item = {
      ...camelCaseItem,
      offersV2: {
        listings: [
          { price: { money: { displayAmount: '￥3,059' } } },
          { price: { money: { displayAmount: '￥9,999' } } },
        ],
      },
    }
    const { products } = parseGetItemsResponse({ itemsResult: { items: [item] } })
    expect(products.B00TQMO5E0?.price).toBe('￥3,059')
  })

  // The description is marketing copy of unbounded length; the card has room
  // for a line of it.
  test('truncates the description at 100 characters', () => {
    const item = {
      ...camelCaseItem,
      itemInfo: { ...camelCaseItem.itemInfo, features: { displayValues: ['あ'.repeat(250)] } },
    }
    const { products } = parseGetItemsResponse({ itemsResult: { items: [item] } })
    expect(products.B00TQMO5E0?.description).toHaveLength(100)
  })

  test('coerces an absent or unparseable rating to zero rather than NaN', () => {
    const item = { ...camelCaseItem, customerReviews: { starRating: { value: 'とても良い' } } }
    const { products } = parseGetItemsResponse({ itemsResult: { items: [item] } })
    expect(products.B00TQMO5E0?.rating).toBe(0)
    expect(products.B00TQMO5E0?.reviewCount).toBe(0)
  })

  // getItems reports per-item problems in `errors` while still returning the
  // items it could resolve; one inaccessible ASIN must not discard the batch.
  test('returns the resolved items alongside the per-item errors', () => {
    const result = parseGetItemsResponse({
      itemsResult: { items: [camelCaseItem] },
      errors: [{ code: 'ItemNotAccessible', item: 'B003ER7K0E' }],
    })
    expect(Object.keys(result.products)).toEqual(['B00TQMO5E0'])
    expect(result.errors).toHaveLength(1)
  })

  test('yields empty results for a reply with no items', () => {
    expect(parseGetItemsResponse({})).toEqual({ products: {}, errors: [] })
    expect(parseGetItemsResponse(null)).toEqual({ products: {}, errors: [] })
    expect(parseGetItemsResponse({ itemsResult: { items: 'nonsense' } })).toEqual({
      products: {},
      errors: [],
    })
  })

  test('normalises a non-array errors field to an empty list', () => {
    expect(parseGetItemsResponse({ errors: 'boom' }).errors).toEqual([])
  })
})

describe('fallbackProduct', () => {
  test('still links to the product with the affiliate tag attached', () => {
    const stub = fallbackProduct('B003ER7K0E', TAG)
    expect(stub.detailPageUrl).toContain('B003ER7K0E')
    expect(stub.detailPageUrl).toContain(`tag=${TAG}`)
    expect(stub.imageUrl).toContain('B003ER7K0E')
    expect(stub.title).toBe('')
  })
})

describe('resolveMissing', () => {
  // Products get delisted, and once that happens the API returns nothing for
  // them forever. Overwriting a captured title would blank out a live card.
  test('keeps a previously captured product', () => {
    const previous = { ...fallbackProduct('B003ER7K0E', TAG), title: '塩熱サプリ' }
    expect(resolveMissing('B003ER7K0E', { B003ER7K0E: previous }, TAG)).toBe(previous)
  })

  test('falls back to the stub when nothing better was ever held', () => {
    expect(resolveMissing('B003ER7K0E', {}, TAG)).toEqual(fallbackProduct('B003ER7K0E', TAG))
  })

  // An earlier run that only ever produced a stub has no title to preserve, so
  // there is nothing to prefer over a fresh one.
  test('falls back to the stub when the previous record is itself a stub', () => {
    const previous = fallbackProduct('B003ER7K0E', 'an-old-tag-22')
    const resolved = resolveMissing('B003ER7K0E', { B003ER7K0E: previous }, TAG)
    expect(resolved.detailPageUrl).toContain(`tag=${TAG}`)
  })
})
