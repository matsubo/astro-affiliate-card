/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import { renderAmazonCard } from './card.js'

const product = {
  url: 'https://www.amazon.co.jp/dp/B00TQMO5E0?tag=triathlon01-22',
  asin: 'B00TQMO5E0',
  title: 'Mag-on(マグオン) エナジージェル グレープフルーツ味 12個入り',
  image: 'https://m.media-amazon.com/images/I/51SE3ju3PqL._SL500_.jpg',
  price: '￥3,059',
  listPrice: '￥3,500',
  description: 'マグネシウムを配合したエナジージェル',
  rating: 4.3,
  reviewCount: 217,
}

describe('renderAmazonCard', () => {
  test('renders the title, image and price', () => {
    const html = renderAmazonCard(product, {})
    expect(html).toContain(product.title)
    expect(html).toContain(product.image)
    expect(html).toContain('￥3,059')
  })

  test('renders the rating only when there is a real one', () => {
    expect(renderAmazonCard(product, {})).toContain('4.3')
    expect(renderAmazonCard({ ...product, rating: 0, reviewCount: 0 }, {})).not.toContain(
      'amazon-card__rating',
    )
  })

  test('shows the list price only when it differs from the price', () => {
    expect(renderAmazonCard(product, {})).toContain('￥3,500')
    expect(renderAmazonCard({ ...product, listPrice: '￥3,059' }, {})).not.toContain(
      'amazon-card__list-price',
    )
  })

  test('falls back to a placeholder when the product has no image', () => {
    const html = renderAmazonCard({ ...product, image: undefined }, {})
    expect(html).toContain('amazon-card__media--empty')
    expect(html).not.toContain('<img')
  })

  // The title and description come from an external API and land in the page
  // unescaped otherwise.
  test('escapes HTML in every interpolated field', () => {
    const html = renderAmazonCard(
      { ...product, title: '<script>alert(1)</script>', description: 'a & b', brand: 'a & b' },
      {},
      { showDescription: true },
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
  })

  test('marks outbound links as sponsored so they are not treated as endorsements', () => {
    const html = renderAmazonCard(product, {})
    expect(html).toContain('nofollow')
    expect(html).toContain('sponsored')
  })
})

describe('renderAmazonCard — information design', () => {
  // Amazon titles are keyword-stuffed for search, not for reading. The brand
  // is the part that actually identifies the product at a glance.
  test('leads with the brand rather than a compliance tag or an ASIN', () => {
    const html = renderAmazonCard({ ...product, brand: 'ROCKBROS' }, {})
    expect(html).toContain('ROCKBROS')
    expect(html).not.toContain('>PR<')
    expect(html).not.toContain('ASIN')
  })

  test('omits the kicker entirely when the product has no brand', () => {
    const html = renderAmazonCard(product, {})
    expect(html).not.toContain('amazon-card__kicker')
  })

  // The Amazon description is more marketing copy of the same kind; showing it
  // doubles the noise without telling the reader anything new.
  test('hides the description unless a site asks for it', () => {
    expect(renderAmazonCard(product, {})).not.toContain(product.description)
    expect(renderAmazonCard(product, {}, { showDescription: true })).toContain(product.description)
  })

  test('still exposes the ASIN and a disclosure for sites that want them', () => {
    const html = renderAmazonCard(product, {}, { showAsin: true, kicker: 'PR' })
    expect(html).toContain('B00TQMO5E0')
    expect(html).toContain('PR')
  })

  test('lets a site override the wording and add a theme class', () => {
    const html = renderAmazonCard(
      product,
      {},
      {
        kicker: '// PARTS REGISTRY',
        cta: 'Amazonで詳細を見る',
        frameClass: 'hud-frame',
      },
    )
    expect(html).toContain('// PARTS REGISTRY')
    expect(html).toContain('Amazonで詳細を見る')
    expect(html).toContain('hud-frame')
  })

  // A site whose own stylesheet claims every <a> needs a way to opt this card
  // out. triathlon does exactly that with `.custom-md a:not(.no-styling)`.
  test('puts a site escape-hatch class on every anchor it renders', () => {
    const html = renderAmazonCard(
      product,
      { rakutenUrl: 'https://hb.afl.rakuten.co.jp/x' },
      { linkClass: 'no-styling' },
    )
    const anchors = html.match(/<a class="[^"]*"/g) ?? []
    expect(anchors.length).toBeGreaterThan(1)
    for (const a of anchors) expect(a).toContain('no-styling')
  })
})

describe('renderAmazonCard — shop buttons', () => {
  test('renders no shop row when no shop links are supplied', () => {
    expect(renderAmazonCard(product, {})).not.toContain('amazon-card__shops')
  })

  test('renders only the shops that have links', () => {
    const html = renderAmazonCard(product, { rakutenUrl: 'https://hb.afl.rakuten.co.jp/x' })
    expect(html).toContain('amazon-card__shop--rakuten')
    expect(html).not.toContain('amazon-card__shop--yahoo')
  })

  test('emits the ValueCommerce beacon alongside the Yahoo! button', () => {
    const html = renderAmazonCard(product, {
      yahooUrl: 'https://ck.jp.ap.valuecommerce.com/x',
      yahooBeaconUrl: 'https://ad.jp.ap.valuecommerce.com/y',
    })
    expect(html).toContain('amazon-card__vc-beacon')
    expect(html).toContain('https://ad.jp.ap.valuecommerce.com/y')
  })

  test('omits the beacon when it is not configured', () => {
    const html = renderAmazonCard(product, { yahooUrl: 'https://ck.jp.ap.valuecommerce.com/x' })
    expect(html).toContain('amazon-card__shop--yahoo')
    expect(html).not.toContain('amazon-card__vc-beacon')
  })
})

describe('renderAmazonCard — missing product data', () => {
  // An ASIN the API cannot resolve still has to produce a working link.
  test('degrades to a titled link when only the URL is known', () => {
    const html = renderAmazonCard({ url: 'https://www.amazon.co.jp/dp/B003ER7K0E' }, {})
    expect(html).toContain('https://www.amazon.co.jp/dp/B003ER7K0E')
    expect(html).toContain('amazon-card__media--empty')
    expect(html).not.toContain('undefined')
  })
})
