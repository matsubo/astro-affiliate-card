// The Astro integration: registers the remark plugin and injects the
// stylesheet, so a site's astro.config only names this once.

import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { AstroIntegration } from 'astro'
import { loadEnv } from 'vite'
import type { CardLabels } from './card.js'
import { remarkAmazon, type ProductRecord } from './remark.js'
import type { ShopCredentials } from './shops.js'

export type { AmazonCardData, CardLabels } from './card.js'
export { renderAmazonCard } from './card.js'
export { remarkAmazon, type ProductRecord, type RemarkAmazonOptions } from './remark.js'
export * from './shops.js'

export interface AffiliateCardOptions {
  /**
   * Product data, relative to the project root.
   * @default 'src/data/amazon-products.json'
   */
  dataFile?: string
  /** Per-site wording and skin. */
  labels?: CardLabels
  /** Also turn standalone bare Amazon URLs into cards. Off by default. */
  bareUrls?: boolean
  /**
   * Overrides for the credentials otherwise read from the environment.
   * Useful in tests, or for a site that keeps secrets somewhere else.
   */
  credentials?: ShopCredentials & { amazonAffiliateTag?: string }
  /**
   * Inject the bundled stylesheet.
   * @default true
   */
  injectStyles?: boolean
}

/**
 * Reads .env explicitly.
 *
 * An integration runs in Astro's config context, where Vite has not yet
 * injected import.meta.env, so .env values are absent from process.env. Real
 * environment variables win, which is what CI and the deploy workflows set.
 */
function readEnvironment(root: string): Record<string, string | undefined> {
  return { ...loadEnv(process.env.NODE_ENV ?? 'production', root, ''), ...process.env }
}

function loadProducts(root: string, dataFile: string): Record<string, ProductRecord> {
  const path = isAbsolute(dataFile) ? dataFile : join(root, dataFile)
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, ProductRecord>
  } catch (error) {
    // A missing or unreadable product file is not fatal: every card falls back
    // to a plain affiliate link, which is far better than failing the build.
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[affiliate-card] could not read ${path} (${reason}); cards will use plain links`)
    return {}
  }
}

export default function affiliateCard(options: AffiliateCardOptions = {}): AstroIntegration {
  const {
    dataFile = 'src/data/amazon-products.json',
    labels,
    bareUrls = false,
    credentials = {},
    injectStyles = true,
  } = options

  return {
    name: 'astro-affiliate-card',
    hooks: {
      'astro:config:setup': ({ config, updateConfig, injectScript, logger }) => {
        const root = config.root.pathname
        const env = readEnvironment(root)

        const affiliateTag = credentials.amazonAffiliateTag ?? env.AMAZON_AFFILIATE_TAG ?? ''
        if (!affiliateTag) {
          logger.warn('AMAZON_AFFILIATE_TAG is not set; Amazon links will carry no tag')
        }

        const shopCredentials: ShopCredentials = {
          rakutenAffiliateId: credentials.rakutenAffiliateId ?? env.RAKUTEN_AFFILIATE_ID,
          yahooVcSid: credentials.yahooVcSid ?? env.YAHOO_VC_SID,
          yahooVcPid: credentials.yahooVcPid ?? env.YAHOO_VC_PID,
        }

        for (const [name, value] of [
          ['RAKUTEN_AFFILIATE_ID', shopCredentials.rakutenAffiliateId],
          ['YAHOO_VC_SID', shopCredentials.yahooVcSid],
          ['YAHOO_VC_PID', shopCredentials.yahooVcPid],
        ] as const) {
          if (!value) logger.info(`${name} is not set; that shop button is omitted`)
        }

        const products = loadProducts(root, dataFile)
        logger.info(`loaded ${Object.keys(products).length} products from ${dataFile}`)

        updateConfig({
          markdown: {
            remarkPlugins: [
              [remarkAmazon, { products, affiliateTag, credentials: shopCredentials, labels, bareUrls }],
            ],
          },
        })

        if (injectStyles) {
          injectScript('page-ssr', `import 'astro-affiliate-card/card.css';`)
        }
      },
    },
  }
}
