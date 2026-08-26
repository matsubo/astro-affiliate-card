// Turns `::amazon{asin="..."}` leaf directives into card markup.
//
// This runs as a remark plugin rather than a rehype one so that it can claim
// the directive before a site's own "flatten unhandled directives" pass turns
// it into literal text.

import type { Root } from 'mdast'
// Registers the directive node types (leafDirective and friends) onto mdast.
// Without this the visitor below has no 'leafDirective' case to narrow to.
import type {} from 'mdast-util-directive'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { type AmazonCardData, type CardLabels, renderAmazonCard } from './card.js'
import { type AffiliateCardOptions, resolveOptions } from './options.js'
import {
  deriveSearchKeyword,
  extractAsin,
  isAmazonUrl,
  resolveShopLinks,
  type ShopCredentials,
} from './shops.js'

/** One entry of a site's amazon-products.json. */
export interface ProductRecord {
  title?: string
  imageUrl?: string
  price?: string
  listPrice?: string
  description?: string
  rating?: number
  reviewCount?: number
  detailPageUrl?: string
  brand?: string
  /** Feeds the shop searches: identifies the product across retailers. */
  partNumber?: string
  model?: string
}

export interface RemarkAmazonOptions {
  /** Product data keyed by ASIN, normally the site's amazon-products.json. */
  products: Record<string, ProductRecord>
  /** Amazon associate tag, used when a product has no detail URL of its own. */
  affiliateTag: string
  credentials: ShopCredentials
  labels?: CardLabels
  /**
   * Also convert bare Amazon URLs that stand alone in a paragraph.
   *
   * Off by default: enabling it rewrites existing prose links into cards,
   * which is a content change a site should opt into deliberately.
   */
  bareUrls?: boolean
}

function fallbackUrl(asin: string, tag: string): string {
  return `https://www.amazon.co.jp/dp/${asin}?tag=${tag}&linkCode=ogi&th=1&psc=1`
}

function toCardData(asin: string, product: ProductRecord | undefined, tag: string): AmazonCardData {
  return {
    url: product?.detailPageUrl || fallbackUrl(asin, tag),
    asin,
    ...(product?.title !== undefined ? { title: product.title } : {}),
    ...(product?.imageUrl !== undefined ? { image: product.imageUrl } : {}),
    ...(product?.price !== undefined ? { price: product.price } : {}),
    ...(product?.listPrice !== undefined ? { listPrice: product.listPrice } : {}),
    ...(product?.description !== undefined ? { description: product.description } : {}),
    ...(product?.rating !== undefined ? { rating: product.rating } : {}),
    ...(product?.reviewCount !== undefined ? { reviewCount: product.reviewCount } : {}),
    ...(product?.brand ? { brand: product.brand } : {}),
  }
}

export const remarkAmazon: Plugin<[RemarkAmazonOptions], Root> = (options) => {
  const { products, affiliateTag, credentials, labels, bareUrls = false } = options

  const cardHtml = (asin: string, kw?: string): string => {
    const product = products[asin]
    const data = toCardData(asin, product, affiliateTag)
    // A part number identifies the product across retailers; the title is a
    // marketing string that over-specifies a shop search into zero hits.
    const keyword = deriveSearchKeyword({ kw, product, title: product?.title })
    const links = resolveShopLinks(keyword, credentials)
    return renderAmazonCard(data, links, labels)
  }

  return (tree) => {
    visit(tree, (node, index, parent) => {
      if (index === undefined || parent === undefined) return

      if (node.type === 'leafDirective' && node.name === 'amazon') {
        const asin = node.attributes?.asin
        // `kw` overrides the derived shop-search keyword, for products whose
        // name searches badly on Rakuten or Yahoo!.
        const kw = node.attributes?.kw ?? undefined
        // A directive with no ASIN has nothing to render; drop it rather than
        // letting it flatten into visible text.
        parent.children.splice(index, 1, {
          type: 'html',
          value: asin ? cardHtml(asin, kw) : '',
        })
        return
      }

      if (!bareUrls) return

      // Only a paragraph that is nothing but one Amazon link becomes a card;
      // a link inside a sentence stays a link.
      if (node.type !== 'paragraph' || node.children.length !== 1) return
      const child = node.children[0]
      if (child?.type !== 'link' || !isAmazonUrl(child.url)) return
      const asin = extractAsin(child.url)
      if (!asin) return

      parent.children.splice(index, 1, { type: 'html', value: cardHtml(asin) })
    })
  }
}

/**
 * A remark plugin ready to drop into an explicitly declared processor.
 *
 * Astro 7's default Markdown processor does not run remark/rehype plugins, so
 * a site that needs them declares `markdown.processor: unified({...})` and
 * lists the plugins itself. An integration cannot reach that list, so those
 * sites call this instead of, or alongside, the integration.
 *
 * Place it after remark-directive (which parses `::amazon`) and before any
 * plugin that flattens unhandled directives.
 *
 * ```js
 * import { createRemarkAmazon } from 'astro-affiliate-card/remark'
 *
 * processor: unified({
 *   remarkPlugins: [remarkDirective, createRemarkAmazon(), parseDirectiveNode],
 * })
 * ```
 */
export function createRemarkAmazon(options: AffiliateCardOptions = {}) {
  const resolved = resolveOptions(options)
  return [remarkAmazon, resolved] as const
}

export default remarkAmazon
