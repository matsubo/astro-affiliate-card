/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import affiliateCard, { type AffiliateCardOptions } from './index.js'
import type { RemarkAmazonOptions } from './remark.js'

const PRODUCTS = {
  B00TQMO5E0: {
    title: 'Mag-on エナジージェル',
    detailPageUrl: 'https://www.amazon.co.jp/dp/B00TQMO5E0?tag=triathlon01-22',
  },
}

// Credentials the integration reads from the environment. Real values in the
// developer's shell or .env would otherwise decide whether these tests pass.
const READ_VARS = [
  'AMAZON_AFFILIATE_TAG',
  'RAKUTEN_AFFILIATE_ID',
  'YAHOO_VC_SID',
  'YAHOO_VC_PID',
] as const

interface Setup {
  remarkOptions: RemarkAmazonOptions
  injected: string[]
  warnings: string[]
  infos: string[]
  consoleWarnings: string[]
}

/** Runs the astro:config:setup hook against fakes and reports what it did. */
function runSetup(
  root: string,
  options: AffiliateCardOptions = {},
  markdown: Record<string, unknown> = {},
): Setup {
  const injected: string[] = []
  const warnings: string[] = []
  const infos: string[] = []
  const consoleWarnings: string[] = []
  let remarkOptions: RemarkAmazonOptions | undefined

  const originalWarn = console.warn
  console.warn = (message: string) => consoleWarnings.push(String(message))

  try {
    const hook = affiliateCard(options).hooks['astro:config:setup']!
    hook({
      config: { root: pathToFileURL(`${root}/`), markdown },
      updateConfig: (update: { markdown: { remarkPlugins: [unknown, RemarkAmazonOptions][] } }) => {
        remarkOptions = update.markdown.remarkPlugins[0]![1]
      },
      injectScript: (stage: string, code: string) => injected.push(`${stage}:${code}`),
      logger: {
        warn: (message: string) => warnings.push(message),
        info: (message: string) => infos.push(message),
      },
    } as never)
  } finally {
    console.warn = originalWarn
  }

  return { remarkOptions: remarkOptions!, injected, warnings, infos, consoleWarnings }
}

describe('affiliateCard integration', () => {
  let root: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'affiliate-card-site-'))
    mkdirSync(join(root, 'src', 'data'), { recursive: true })
    writeFileSync(join(root, 'src/data/amazon-products.json'), JSON.stringify(PRODUCTS))

    savedEnv = Object.fromEntries(READ_VARS.map((name) => [name, process.env[name]]))
    for (const name of READ_VARS) delete process.env[name]
  })

  afterEach(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(root, { recursive: true, force: true })
  })

  test('names itself so Astro can report it', () => {
    expect(affiliateCard().name).toBe('astro-affiliate-card')
  })

  test('registers the remark plugin with the site’s products', () => {
    process.env.AMAZON_AFFILIATE_TAG = 'triathlon01-22'
    const { remarkOptions, infos } = runSetup(root)

    expect(remarkOptions.products).toEqual(PRODUCTS)
    expect(remarkOptions.affiliateTag).toBe('triathlon01-22')
    expect(infos.some((message) => message.includes('loaded 1 products'))).toBe(true)
  })

  test('reads a data file at a path of the site’s choosing', () => {
    writeFileSync(join(root, 'products.json'), JSON.stringify(PRODUCTS))
    expect(runSetup(root, { dataFile: 'products.json' }).remarkOptions.products).toEqual(PRODUCTS)
  })

  test('accepts an absolute data file path', () => {
    const absolute = join(root, 'elsewhere.json')
    writeFileSync(absolute, JSON.stringify(PRODUCTS))
    expect(runSetup(root, { dataFile: absolute }).remarkOptions.products).toEqual(PRODUCTS)
  })

  // Every card falls back to a plain affiliate link, which is far better than
  // failing a site's build over a file that has not been generated yet.
  test('warns but does not fail the build when the data file is missing', () => {
    rmSync(join(root, 'src/data/amazon-products.json'))
    const { remarkOptions, warnings } = runSetup(root)

    expect(remarkOptions.products).toEqual({})
    // Reported through Astro's logger rather than console.warn, so it is
    // prefixed and obeys the build's log level like every other integration
    // message.
    expect(warnings.some((message) => message.includes('cards will use plain links'))).toBe(true)
  })

  // Astro 7's default Markdown processor runs no remark plugins, so sites
  // that need them declare `markdown.processor` and list plugins themselves.
  // This integration cannot reach that list, and the failure mode is silent --
  // every ::amazon renders as literal text. Three of the four sites this
  // package serves are in exactly that shape, and one of them shipped a build
  // with no cards at all before anyone noticed.
  test('refuses to register silently when markdown.processor is declared', () => {
    const { warnings } = runSetup(root, {}, { processor: {} })

    expect(warnings.some((m) => m.includes('markdown.processor is declared explicitly'))).toBe(true)
    expect(warnings.some((m) => m.includes('createRemarkAmazon'))).toBe(true)
  })

  test('still injects the stylesheet when it cannot register the plugin', () => {
    const { injected } = runSetup(root, {}, { processor: {} })
    expect(injected.some((entry) => entry.includes('card.css'))).toBe(true)
  })

  test('survives a data file that is not valid JSON', () => {
    writeFileSync(join(root, 'src/data/amazon-products.json'), '{ not json')
    expect(runSetup(root).remarkOptions.products).toEqual({})
  })

  test('passes labels and bareUrls straight through', () => {
    const { remarkOptions } = runSetup(root, {
      labels: { kicker: '// PARTS REGISTRY' },
      bareUrls: true,
    })
    expect(remarkOptions.labels).toEqual({ kicker: '// PARTS REGISTRY' })
    expect(remarkOptions.bareUrls).toBe(true)
  })

  test('leaves bare URLs alone unless the site opts in', () => {
    expect(runSetup(root).remarkOptions.bareUrls).toBe(false)
  })
})

describe('affiliateCard credentials', () => {
  let root: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'affiliate-card-site-'))
    mkdirSync(join(root, 'src', 'data'), { recursive: true })
    writeFileSync(join(root, 'src/data/amazon-products.json'), '{}')
    savedEnv = Object.fromEntries(READ_VARS.map((name) => [name, process.env[name]]))
    for (const name of READ_VARS) delete process.env[name]
  })

  afterEach(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(root, { recursive: true, force: true })
  })

  test('takes every credential from the environment', () => {
    process.env.AMAZON_AFFILIATE_TAG = 'triathlon01-22'
    process.env.RAKUTEN_AFFILIATE_ID = 'abc.123'
    process.env.YAHOO_VC_SID = '888'
    process.env.YAHOO_VC_PID = '999'

    const { remarkOptions } = runSetup(root)
    expect(remarkOptions.affiliateTag).toBe('triathlon01-22')
    expect(remarkOptions.credentials).toEqual({
      rakutenAffiliateId: 'abc.123',
      yahooVcSid: '888',
      yahooVcPid: '999',
    })
  })

  // A site that keeps its secrets somewhere other than the environment, and
  // the tests of a site that keeps them nowhere at all.
  test('lets explicit options override the environment', () => {
    process.env.AMAZON_AFFILIATE_TAG = 'from-env-22'
    const { remarkOptions } = runSetup(root, {
      credentials: { amazonAffiliateTag: 'from-options-22', rakutenAffiliateId: 'xyz.789' },
    })
    expect(remarkOptions.affiliateTag).toBe('from-options-22')
    expect(remarkOptions.credentials.rakutenAffiliateId).toBe('xyz.789')
  })

  // An untagged Amazon link earns nothing, and the failure is invisible in the
  // rendered page.
  test('warns loudly when there is no Amazon tag at all', () => {
    const { warnings, remarkOptions } = runSetup(root)
    expect(warnings.some((message) => message.includes('AMAZON_AFFILIATE_TAG'))).toBe(true)
    expect(remarkOptions.affiliateTag).toBe('')
  })

  // Not signing up for a network is a normal choice, so this is an info rather
  // than a warning — but it should still be visible in the build log.
  test('notes each shop it will omit for want of credentials', () => {
    const { infos } = runSetup(root)
    expect(infos.some((message) => message.includes('RAKUTEN_AFFILIATE_ID'))).toBe(true)
    expect(infos.some((message) => message.includes('YAHOO_VC_SID'))).toBe(true)
    expect(infos.some((message) => message.includes('YAHOO_VC_PID'))).toBe(true)
  })

  test('says nothing about a shop that is configured', () => {
    process.env.RAKUTEN_AFFILIATE_ID = 'abc.123'
    const { infos } = runSetup(root)
    expect(infos.some((message) => message.includes('RAKUTEN_AFFILIATE_ID'))).toBe(false)
  })
})

describe('affiliateCard stylesheet', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'affiliate-card-site-'))
    mkdirSync(join(root, 'src', 'data'), { recursive: true })
    writeFileSync(join(root, 'src/data/amazon-products.json'), '{}')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('injects the bundled stylesheet by default', () => {
    const { injected } = runSetup(root)
    expect(injected).toEqual(["page-ssr:import 'astro-affiliate-card/card.css';"])
  })

  // A site with its own skin needs to be able to opt out rather than fight the
  // shipped stylesheet's specificity.
  test('skips the stylesheet when the site supplies its own', () => {
    expect(runSetup(root, { injectStyles: false }).injected).toEqual([])
  })
})
