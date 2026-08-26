/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import {
  buildRakutenSearchUrl,
  buildYahooBeaconUrl,
  buildYahooSearchUrl,
  extractAsin,
  isAmazonUrl,
  resolveShopLinks,
} from './shops'

describe('extractAsin', () => {
  test('extracts the ASIN from /dp/ URLs', () => {
    expect(extractAsin('https://www.amazon.co.jp/dp/B00TZNN7Z8?tag=triathlon01-22')).toBe(
      'B00TZNN7Z8',
    )
  })

  test('extracts the ASIN from /gp/product/ URLs', () => {
    expect(extractAsin('https://www.amazon.co.jp/gp/product/B016RJPL4W')).toBe('B016RJPL4W')
  })

  test('returns null for short links, which hide the ASIN', () => {
    expect(extractAsin('https://amzn.to/3ILbvFu')).toBeNull()
  })
})

describe('isAmazonUrl', () => {
  test('accepts marketplace and short-link domains', () => {
    expect(isAmazonUrl('https://www.amazon.co.jp/dp/B00TZNN7Z8')).toBe(true)
    expect(isAmazonUrl('https://amzn.to/3ILbvFu')).toBe(true)
    expect(isAmazonUrl('https://amzn.asia/d/abc')).toBe(true)
  })

  test('rejects look-alike domains', () => {
    expect(isAmazonUrl('https://www.google.com/')).toBe(false)
    expect(isAmazonUrl('https://amazonripoff.example.com/dp/B00TZNN7Z8')).toBe(false)
  })
})

describe('buildRakutenSearchUrl', () => {
  test('returns null when the affiliate id or keyword is missing', () => {
    expect(buildRakutenSearchUrl('ジェル', undefined)).toBeNull()
    expect(buildRakutenSearchUrl('ジェル', '')).toBeNull()
    expect(buildRakutenSearchUrl('', 'abc.123')).toBeNull()
  })

  test('wraps an Ichiba search in a どこでもリンク referral', () => {
    const url = buildRakutenSearchUrl('メダリスト ジェル', 'abc.123')
    expect(url).toStartWith('https://hb.afl.rakuten.co.jp/hgc/abc.123/?pc=')
    expect(url).toContain(
      encodeURIComponent(
        `https://search.rakuten.co.jp/search/mall/${encodeURIComponent('メダリスト ジェル')}/`,
      ),
    )
  })
})

describe('buildYahooSearchUrl', () => {
  test('returns null when either ValueCommerce id or the keyword is missing', () => {
    expect(buildYahooSearchUrl('ジェル', undefined, '999')).toBeNull()
    expect(buildYahooSearchUrl('ジェル', '888', undefined)).toBeNull()
    expect(buildYahooSearchUrl('', '888', '999')).toBeNull()
  })

  test('wraps a Yahoo! Shopping search in a ValueCommerce referral', () => {
    const url = buildYahooSearchUrl('ジェル', '888', '999')
    expect(url).toStartWith(
      'https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=888&pid=999&vc_url=',
    )
    expect(url).toContain(encodeURIComponent('https://shopping.yahoo.co.jp/search?p='))
  })
})

describe('buildYahooBeaconUrl', () => {
  test('returns the 1x1 impression beacon when configured', () => {
    expect(buildYahooBeaconUrl('888', '999')).toBe(
      'https://ad.jp.ap.valuecommerce.com/servlet/gifbanner?sid=888&pid=999',
    )
  })

  test('returns null when either id is missing', () => {
    expect(buildYahooBeaconUrl(undefined, '999')).toBeNull()
    expect(buildYahooBeaconUrl('888', undefined)).toBeNull()
  })
})

describe('resolveShopLinks', () => {
  const creds = { rakutenAffiliateId: 'abc.123', yahooVcSid: '888', yahooVcPid: '999' }

  test('builds every link when fully configured', () => {
    const links = resolveShopLinks('メダリスト', creds)
    expect(links.rakutenUrl).toStartWith('https://hb.afl.rakuten.co.jp/')
    expect(links.yahooUrl).toStartWith('https://ck.jp.ap.valuecommerce.com/')
    expect(links.yahooBeaconUrl).toStartWith('https://ad.jp.ap.valuecommerce.com/')
  })

  // A site that has not signed up for a network should get no button at all,
  // rather than a link that goes nowhere or leaks an unattributed referral.
  test('omits a shop whose credentials are absent', () => {
    const links = resolveShopLinks('メダリスト', { rakutenAffiliateId: 'abc.123' })
    expect(links.rakutenUrl).toStartWith('https://hb.afl.rakuten.co.jp/')
    expect(links.yahooUrl).toBeNull()
    expect(links.yahooBeaconUrl).toBeNull()
  })

  test('yields nothing when there is no keyword to search for', () => {
    const links = resolveShopLinks('', creds)
    expect(links.rakutenUrl).toBeNull()
    expect(links.yahooUrl).toBeNull()
  })
})
