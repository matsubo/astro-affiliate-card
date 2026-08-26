/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { remarkAmazon, type RemarkAmazonOptions } from './remark'

const products = {
  B00TQMO5E0: {
    title: 'Mag-on エナジージェル グレープフルーツ味 12個入り',
    imageUrl: 'https://m.media-amazon.com/images/I/51.jpg',
    price: '￥3,059',
    detailPageUrl: 'https://www.amazon.co.jp/dp/B00TQMO5E0?tag=triathlon01-22',
  },
}

function render(markdown: string, options: Partial<RemarkAmazonOptions> = {}): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkAmazon, {
      products,
      affiliateTag: 'triathlon01-22',
      credentials: {},
      ...options,
    } as RemarkAmazonOptions)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .processSync(markdown)
  return String(file)
}

describe('remarkAmazon', () => {
  test('turns a ::amazon directive into a card', () => {
    const html = render('::amazon{asin="B00TQMO5E0"}')
    expect(html).toContain('amazon-card')
    expect(html).toContain('Mag-on エナジージェル')
    expect(html).toContain('￥3,059')
  })

  // The directive must not survive into the output as literal text, which is
  // what happens when an unhandled directive gets flattened.
  test('leaves no directive syntax behind', () => {
    const html = render('::amazon{asin="B00TQMO5E0"}')
    expect(html).not.toContain('::amazon')
    expect(html).not.toContain('asin=')
  })

  // An ASIN the API never resolved still has to link somewhere useful.
  test('falls back to a plain affiliate link for an unknown ASIN', () => {
    const html = render('::amazon{asin="B003ER7K0E"}')
    expect(html).toContain('amazon-card')
    expect(html).toContain('B003ER7K0E')
    expect(html).toContain('tag=triathlon01-22')
  })

  test('ignores a directive with no asin', () => {
    const html = render('::amazon')
    expect(html).not.toContain('amazon-card')
  })

  test('renders shop buttons when credentials are supplied', () => {
    const html = render('::amazon{asin="B00TQMO5E0"}', {
      credentials: { rakutenAffiliateId: 'abc.123', yahooVcSid: '888', yahooVcPid: '999' },
    })
    expect(html).toContain('amazon-card__shop--rakuten')
    expect(html).toContain('amazon-card__shop--yahoo')
  })

  test('passes site labels through to the card', () => {
    const html = render('::amazon{asin="B00TQMO5E0"}', {
      labels: { kicker: '// PARTS REGISTRY', frameClass: 'hud-frame' },
    })
    expect(html).toContain('// PARTS REGISTRY')
    expect(html).toContain('hud-frame')
  })
})

describe('remarkAmazon — bare Amazon URLs', () => {
  const markdown = 'これを買いました。\n\nhttps://www.amazon.co.jp/dp/B00TQMO5E0\n'

  // Three of the four sites have Amazon links in prose that must stay links.
  test('leaves bare URLs alone by default', () => {
    const html = render(markdown)
    expect(html).not.toContain('amazon-card')
  })

  test('converts bare URLs only when explicitly enabled', () => {
    const html = render(markdown, { bareUrls: true })
    expect(html).toContain('amazon-card')
    expect(html).toContain('Mag-on エナジージェル')
  })

  test('never touches non-Amazon URLs', () => {
    const html = render('https://example.com/dp/B00TQMO5E0\n', { bareUrls: true })
    expect(html).not.toContain('amazon-card')
  })
})
