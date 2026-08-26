/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Logger, resolveOptions } from './options.js'

// Credentials resolveOptions reads from the environment. Real values in the
// developer's shell would otherwise decide whether these tests pass — and the
// repository's own .env holds live ones.
const READ_VARS = [
  'AMAZON_AFFILIATE_TAG',
  'RAKUTEN_AFFILIATE_ID',
  'YAHOO_VC_SID',
  'YAHOO_VC_PID',
] as const

function recordingLogger(): Logger & { infos: string[]; warnings: string[] } {
  const infos: string[] = []
  const warnings: string[] = []
  return { infos, warnings, info: (m) => infos.push(m), warn: (m) => warnings.push(m) }
}

describe('resolveOptions', () => {
  let root: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'affiliate-card-options-'))
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

  // Astro config runs before Vite injects import.meta.env, so an integration
  // that does not read .env itself sees no credentials at all.
  test('reads credentials from the project’s .env', () => {
    writeFileSync(
      join(root, '.env'),
      [
        '# Amazon',
        '',
        'AMAZON_AFFILIATE_TAG=triathlon01-22',
        'RAKUTEN_AFFILIATE_ID="1d45d69e.d383737b"',
        "YAHOO_VC_SID='88888888'",
        'YAHOO_VC_PID = 887766 ',
      ].join('\n'),
    )

    const resolved = resolveOptions({ root }, recordingLogger())

    expect(resolved.affiliateTag).toBe('triathlon01-22')
    // Surrounding quotes belong to the file format, not to the value.
    expect(resolved.credentials?.rakutenAffiliateId).toBe('1d45d69e.d383737b')
    expect(resolved.credentials?.yahooVcSid).toBe('88888888')
    expect(resolved.credentials?.yahooVcPid).toBe('887766')
  })

  test('ignores comments, blank lines and lines that name nothing', () => {
    writeFileSync(
      join(root, '.env'),
      ['#AMAZON_AFFILIATE_TAG=commented-out', '', 'NOT_AN_ASSIGNMENT', '=novalue'].join('\n'),
    )

    const logger = recordingLogger()
    expect(resolveOptions({ root }, logger).affiliateTag).toBe('')
    expect(logger.warnings.some((m) => m.includes('AMAZON_AFFILIATE_TAG is not set'))).toBe(true)
  })

  // CI and the deploy workflows set real variables; .env is the local fallback.
  test('lets a real environment variable win over .env', () => {
    writeFileSync(join(root, '.env'), 'AMAZON_AFFILIATE_TAG=from-dotenv')
    process.env.AMAZON_AFFILIATE_TAG = 'from-environment'

    expect(resolveOptions({ root }, recordingLogger()).affiliateTag).toBe('from-environment')
  })

  test('explicit credentials beat both', () => {
    writeFileSync(join(root, '.env'), 'AMAZON_AFFILIATE_TAG=from-dotenv')
    process.env.AMAZON_AFFILIATE_TAG = 'from-environment'

    const resolved = resolveOptions(
      { root, credentials: { amazonAffiliateTag: 'explicit-22' } },
      recordingLogger(),
    )
    expect(resolved.affiliateTag).toBe('explicit-22')
  })

  test('notes each shop whose credentials are missing', () => {
    const logger = recordingLogger()
    resolveOptions({ root }, logger)

    for (const name of ['RAKUTEN_AFFILIATE_ID', 'YAHOO_VC_SID', 'YAHOO_VC_PID']) {
      expect(logger.infos.some((m) => m.startsWith(`${name} is not set`))).toBe(true)
    }
  })

  test('falls back to plain links when the data file is unreadable', () => {
    const logger = recordingLogger()
    const resolved = resolveOptions({ root }, logger)

    expect(resolved.products).toEqual({})
    expect(logger.warnings.some((m) => m.includes('cards will use plain links'))).toBe(true)
  })

  // Without a logger the messages have to reach the console prefixed, or a site
  // owner cannot tell which integration is complaining.
  test('prefixes its own console output when no logger is supplied', () => {
    const logs: string[] = []
    const warns: string[] = []
    const originalLog = console.log
    const originalWarn = console.warn
    console.log = (message: string) => logs.push(String(message))
    console.warn = (message: string) => warns.push(String(message))

    try {
      resolveOptions({ root })
    } finally {
      console.log = originalLog
      console.warn = originalWarn
    }

    expect(warns.every((m) => m.startsWith('[affiliate-card] '))).toBe(true)
    expect(logs.every((m) => m.startsWith('[affiliate-card] '))).toBe(true)
    expect(warns.some((m) => m.includes('AMAZON_AFFILIATE_TAG is not set'))).toBe(true)
    expect(logs.some((m) => m.includes('loaded 0 products'))).toBe(true)
  })
})
