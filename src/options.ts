// Shared resolution of everything the remark plugin needs.
//
// Two entry points need it: the Astro integration, and createRemarkAmazon()
// for sites that declare `markdown.processor` explicitly and place plugins
// themselves.

import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { CardLabels } from './card.js'
import type { ProductRecord, RemarkAmazonOptions } from './remark.js'
import type { ShopCredentials } from './shops.js'

export interface AffiliateCardOptions {
  /**
   * Product data, relative to the project root.
   * @default 'src/data/amazon-products.json'
   */
  dataFile?: string
  /** Project root. Defaults to the current working directory. */
  root?: string
  /** Per-site wording and skin. */
  labels?: CardLabels
  /** Also turn standalone bare Amazon URLs into cards. Off by default. */
  bareUrls?: boolean
  /**
   * Overrides for the credentials otherwise read from the environment.
   * Useful in tests, or for a site that keeps secrets somewhere else.
   */
  credentials?: ShopCredentials & { amazonAffiliateTag?: string }
}

export interface Logger {
  info(message: string): void
  warn(message: string): void
}

const CONSOLE_LOGGER: Logger = {
  info: (m) => console.log(`[affiliate-card] ${m}`),
  warn: (m) => console.warn(`[affiliate-card] ${m}`),
}

/**
 * Reads .env explicitly.
 *
 * Astro config runs before Vite injects import.meta.env, so .env values are
 * absent from process.env at this point. Real environment variables win, which
 * is what CI and the deploy workflows set.
 */
function readEnvironment(root: string): Record<string, string | undefined> {
  const values: Record<string, string> = {}
  try {
    const text = readFileSync(join(root, '.env'), 'utf-8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      values[trimmed.slice(0, eq).trim()] = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["'](.*)["']$/, '$1')
    }
  } catch {
    // No .env file — the environment already carries what CI provides.
  }
  return { ...values, ...process.env }
}

function loadProducts(
  root: string,
  dataFile: string,
  logger: Logger,
): Record<string, ProductRecord> {
  const path = isAbsolute(dataFile) ? dataFile : join(root, dataFile)
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, ProductRecord>
  } catch (error) {
    // A missing product file is not fatal: every card falls back to a plain
    // affiliate link, which beats failing a build over a data file.
    const reason = error instanceof Error ? error.message : String(error)
    logger.warn(`could not read ${path} (${reason}); cards will use plain links`)
    return {}
  }
}

/** Turns user-facing options plus the environment into remark plugin options. */
export function resolveOptions(
  options: AffiliateCardOptions = {},
  logger: Logger = CONSOLE_LOGGER,
): RemarkAmazonOptions {
  const {
    dataFile = 'src/data/amazon-products.json',
    root = process.cwd(),
    labels,
    bareUrls = false,
    credentials = {},
  } = options

  const env = readEnvironment(root)

  const affiliateTag = credentials.amazonAffiliateTag ?? env.AMAZON_AFFILIATE_TAG ?? ''
  if (!affiliateTag) {
    // Worth a warning rather than a note: untagged links earn nothing, and the
    // pages look completely normal, so nothing else would reveal it.
    logger.warn('AMAZON_AFFILIATE_TAG is not set; Amazon links will carry no tag and earn nothing')
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

  const products = loadProducts(root, dataFile, logger)
  logger.info(`loaded ${Object.keys(products).length} products from ${dataFile}`)

  return {
    products,
    affiliateTag,
    credentials: shopCredentials,
    ...(labels !== undefined ? { labels } : {}),
    bareUrls,
  }
}
