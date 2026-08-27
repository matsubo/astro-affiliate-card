/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import {
  buildRakutenSearchUrl,
  buildYahooBeaconUrl,
  buildYahooSearchUrl,
  deriveSearchKeyword,
  extractAsin,
  isAmazonUrl,
  resolveShopLinks,
} from './shops.js'

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

describe('deriveSearchKeyword', () => {
  // Amazon titles are keyword-stuffed. Handed to Rakuten verbatim they
  // over-specify the search into zero hits, so the shop buttons land on an
  // empty results page -- which is worse than not showing them.
  test('condenses a keyword-stuffed title to whole tokens under ~30 chars', () => {
    const title =
      '【PS5対応】メーカー保証3年 ROCKBROS 偏光サングラス 交換可能レンズ2枚 UV400 紫外線カット'
    const keyword = deriveSearchKeyword({ title })
    // 【】 segments go; the rest is trimmed to whole tokens. It does not try to
    // guess which token is the brand -- that is what partNumber/model are for.
    expect(keyword).not.toContain('【')
    expect(keyword).not.toContain('PS5対応')
    expect(keyword.length).toBeLessThanOrEqual(30)
    expect(keyword).toContain('ROCKBROS')
  })

  test('prefers a part number over the title', () => {
    expect(
      deriveSearchKeyword({ title: '長い長い商品名', product: { partNumber: 'T2875.72' } }),
    ).toBe('T2875.72')
  })

  test('falls back to the model when there is no part number', () => {
    expect(deriveSearchKeyword({ title: '長い長い商品名', product: { model: 'NEO 2T' } })).toBe(
      'NEO 2T',
    )
  })

  test('an explicit kw beats everything', () => {
    expect(
      deriveSearchKeyword({
        kw: 'メダリスト ジェル',
        title: '長い商品名',
        product: { partNumber: 'X1' },
      }),
    ).toBe('メダリスト ジェル')
  })

  test('yields nothing when there is nothing to search for', () => {
    expect(deriveSearchKeyword({})).toBe('')
  })

  test('never splits a token in half', () => {
    const keyword = deriveSearchKeyword({ title: 'ABCDEFGHIJ 0123456789 abcdefghij klmnop' })
    for (const token of keyword.split(' ')) {
      expect('ABCDEFGHIJ 0123456789 abcdefghij klmnop'.split(' ')).toContain(token)
    }
  })

  // The Creators API also stuffs internal SKUs, brand names and variant
  // phrases into partNumber/model. Searching Rakuten for one of those lands
  // on zero results -- worse than the title fallback it replaced.
  test('rejects an internal SKU and falls back to the title', () => {
    const title = 'RTL-SDR Blog V3 R860 RTL2832U 1PPM TCXO SMA ソフトウェア デファインド ラジオ'
    const keyword = deriveSearchKeyword({ title, product: { partNumber: 'rtlsdr_only' } })
    expect(keyword).not.toBe('rtlsdr_only')
    expect(keyword.startsWith('RTL-SDR')).toBe(true)
  })

  test('rejects a bare lowercase word as a part number', () => {
    expect(
      deriveSearchKeyword({
        title: 'Modern Operating Systems',
        product: { partNumber: 'illustrations' },
      }),
    ).toBe('Modern Operating Systems')
  })

  test('rejects a brand name in the part number field', () => {
    expect(
      deriveSearchKeyword({
        title: 'ホルツ ペイント塗料 プラサフ グレー',
        product: { partNumber: 'ホルツ', model: 'MH11503' },
      }),
    ).toBe('MH11503')
  })

  test('rejects a multi-token phrase as a part number', () => {
    expect(
      deriveSearchKeyword({
        title: 'ハーマンミラー エンボディチェア',
        product: { partNumber: 'CN122AWAA G1 G1 BB 3513' },
      }),
    ).toBe('ハーマンミラー エンボディチェア')
  })

  test('rejects a variant phrase with parentheses', () => {
    expect(
      deriveSearchKeyword({
        title: 'LOWEPRO カメラリュック フリップサイド300',
        product: { partNumber: 'Flipside 300 (Black)' },
      }),
    ).toBe('LOWEPRO カメラリュック フリップサイド300')
  })

  test('keeps real retail model codes', () => {
    expect(
      deriveSearchKeyword({ title: 'コメット アンテナ', product: { partNumber: 'M-24S' } }),
    ).toBe('M-24S')
    expect(deriveSearchKeyword({ title: 'アンテナ', product: { partNumber: 'SG7500' } })).toBe(
      'SG7500',
    )
    expect(
      deriveSearchKeyword({ title: 'ウォークマン', product: { partNumber: 'NW-E405 B' } }),
    ).toBe('NW-E405 B')
    // Letters-only dashed codes are model codes too (Topeak TJB-SPT).
    expect(
      deriveSearchKeyword({ title: 'トピーク ポンプ', product: { partNumber: 'TJB-SPT' } }),
    ).toBe('TJB-SPT')
  })
})
