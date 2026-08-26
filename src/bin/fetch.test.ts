/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The CLI calls main() at module scope, so importing it would run it. It is
// driven as a subprocess instead, which is also the contract a site's CI uses.
//
// Only the paths that stop before the first request are covered here: anything
// past configuration reaches the real Creators API. The sync rules themselves
// are tested directly in creators/sync.test.ts.
const CLI = join(import.meta.dir, 'fetch.ts')

/** Runs the CLI in `cwd` with exactly the given environment. */
async function run(cwd: string, args: string[] = [], env: Record<string, string> = {}) {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

describe('affiliate-card fetch', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'affiliate-card-cli-'))
  })

  afterEach(() => rmSync(cwd, { recursive: true, force: true }))

  test('prints usage and exits cleanly for --help', async () => {
    const { stdout, exitCode } = await run(cwd, ['--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Usage: affiliate-card fetch')
    expect(stdout).toContain('--posts')
    expect(stdout).toContain('--out')
    expect(stdout).toContain('--force')
  })

  test('accepts the -h short form', async () => {
    expect((await run(cwd, ['-h'])).exitCode).toBe(0)
  })

  // A scheduled workflow has to fail visibly when its secrets are gone, rather
  // than writing an empty product file.
  test('exits non-zero and names what is missing without any credentials', async () => {
    const { stderr, exitCode } = await run(cwd)
    expect(exitCode).toBe(1)
    expect(stderr).toContain('AMAZON_CREATOR_CREDENTIAL_ID')
    expect(stderr).toContain('AMAZON_CREATOR_SECRET')
    expect(stderr).toContain('AMAZON_AFFILIATE_TAG')
  })

  test('reads credentials from a .env beside the project', async () => {
    writeFileSync(
      join(cwd, '.env'),
      [
        '# Creators API credentials',
        '',
        'AMAZON_CREATOR_CREDENTIAL_ID=credential-id',
        'AMAZON_CREATOR_SECRET=credential-secret',
      ].join('\n'),
    )
    const { stderr, exitCode } = await run(cwd)

    expect(exitCode).toBe(1)
    // Only the one still absent — the other two came out of the .env.
    expect(stderr).toContain('AMAZON_AFFILIATE_TAG')
    expect(stderr).not.toContain('AMAZON_CREATOR_SECRET.')
  })

  test('strips quotes from .env values', async () => {
    writeFileSync(
      join(cwd, '.env'),
      [
        'AMAZON_CREATOR_CREDENTIAL_ID="credential-id"',
        "AMAZON_CREATOR_SECRET='credential-secret'",
        'AMAZON_AFFILIATE_TAG="triathlon01-22"',
        "AMAZON_CREATOR_CREDENTIAL_VERSION='9.9'",
      ].join('\n'),
    )
    const { stderr } = await run(cwd)

    expect(stderr).toContain('credential version "9.9"')
  })

  // CI secrets have to beat a stray .env left in a checkout.
  test('lets a real environment variable override the .env', async () => {
    writeFileSync(
      join(cwd, '.env'),
      [
        'AMAZON_CREATOR_CREDENTIAL_ID=credential-id',
        'AMAZON_CREATOR_SECRET=credential-secret',
        'AMAZON_AFFILIATE_TAG=from-dotenv-22',
        'AMAZON_CREATOR_CREDENTIAL_VERSION=3.3',
      ].join('\n'),
    )
    const { stderr } = await run(cwd, [], { AMAZON_CREATOR_CREDENTIAL_VERSION: '9.9' })

    expect(stderr).toContain('credential version "9.9"')
  })

  test('runs without a .env at all', async () => {
    const { stderr, exitCode } = await run(cwd, [], {
      AMAZON_CREATOR_CREDENTIAL_ID: 'credential-id',
      AMAZON_CREATOR_SECRET: 'credential-secret',
      AMAZON_AFFILIATE_TAG: 'triathlon01-22',
      AMAZON_CREATOR_CREDENTIAL_VERSION: '9.9',
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('credential version "9.9"')
  })

  // Someone pointing PA-API v5 keys at this needs telling that Amazon retired
  // that API rather than debugging a 401.
  test('explains that PA-API v5 keys are not Creators API credentials', async () => {
    const { stderr } = await run(cwd, [], { AMAZON_API_KEY: 'AKIA...', AMAZON_API_SECRET: 'secret' })
    expect(stderr).toContain('PA-API v5 credentials')
  })
})
