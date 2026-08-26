/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import {
  authorizationHeader,
  CREDENTIAL_VERSIONS,
  DEFAULT_CREDENTIAL_VERSION,
  DEFAULT_MARKETPLACE,
  loadConfig,
  resolveTokenEndpoint,
  usesLoginWithAmazon,
} from './config.js'

const VALID_ENV = {
  AMAZON_CREATOR_CREDENTIAL_ID: 'credential-id',
  AMAZON_CREATOR_SECRET: 'credential-secret',
  AMAZON_AFFILIATE_TAG: 'triathlon01-22',
}

describe('resolveTokenEndpoint', () => {
  test('routes 3.x credentials to Login with Amazon', () => {
    expect(resolveTokenEndpoint(CREDENTIAL_VERSIONS.FE_V3)).toBe(
      'https://api.amazon.co.jp/auth/o2/token',
    )
    expect(resolveTokenEndpoint(CREDENTIAL_VERSIONS.NA_V3)).toBe(
      'https://api.amazon.com/auth/o2/token',
    )
  })

  test('routes 2.x credentials to the regional Cognito pool', () => {
    expect(resolveTokenEndpoint(CREDENTIAL_VERSIONS.FE_V2)).toContain('amazoncognito.com')
  })

  // A typo'd version would otherwise surface as an opaque fetch failure
  // against `undefined`.
  test('names the versions it knows when given one it does not', () => {
    expect(() => resolveTokenEndpoint('4.0')).toThrow(/Unknown Creators API credential version/)
    expect(() => resolveTokenEndpoint('4.0')).toThrow(/3\.3/)
  })
})

describe('usesLoginWithAmazon', () => {
  test('separates the two credential generations', () => {
    expect(usesLoginWithAmazon('3.3')).toBe(true)
    expect(usesLoginWithAmazon('2.3')).toBe(false)
  })
})

describe('authorizationHeader', () => {
  // The two generations disagree about this header, and getting it wrong is an
  // HTTP 401 that looks exactly like a bad credential.
  test('appends the version for 2.x but not for 3.x', () => {
    expect(authorizationHeader('tok', '2.3')).toBe('Bearer tok, Version 2.3')
    expect(authorizationHeader('tok', '3.3')).toBe('Bearer tok')
  })
})

describe('loadConfig', () => {
  test('builds the run configuration from the required variables', () => {
    const config = loadConfig(VALID_ENV)
    expect(config).toEqual({
      credentialId: 'credential-id',
      credentialSecret: 'credential-secret',
      partnerTag: 'triathlon01-22',
      marketplace: DEFAULT_MARKETPLACE,
      credentialVersion: DEFAULT_CREDENTIAL_VERSION,
      tokenEndpoint: 'https://api.amazon.co.jp/auth/o2/token',
    })
  })

  test('honours the optional marketplace and credential version', () => {
    const config = loadConfig({
      ...VALID_ENV,
      AMAZON_MARKETPLACE: 'www.amazon.com',
      AMAZON_CREATOR_CREDENTIAL_VERSION: '3.1',
    })
    expect(config.marketplace).toBe('www.amazon.com')
    expect(config.tokenEndpoint).toBe('https://api.amazon.com/auth/o2/token')
  })

  // Secrets pasted into a .env or a CI secret field pick up stray whitespace,
  // which reaches Amazon as part of the credential otherwise.
  test('trims whitespace off every value', () => {
    const config = loadConfig({
      AMAZON_CREATOR_CREDENTIAL_ID: '  credential-id\n',
      AMAZON_CREATOR_SECRET: ' credential-secret ',
      AMAZON_AFFILIATE_TAG: '\ttriathlon01-22 ',
      AMAZON_MARKETPLACE: '  www.amazon.com  ',
    })
    expect(config.credentialId).toBe('credential-id')
    expect(config.credentialSecret).toBe('credential-secret')
    expect(config.partnerTag).toBe('triathlon01-22')
    expect(config.marketplace).toBe('www.amazon.com')
  })

  test('ignores a variable that is present but blank', () => {
    expect(() => loadConfig({ ...VALID_ENV, AMAZON_AFFILIATE_TAG: '   ' })).toThrow(
      /AMAZON_AFFILIATE_TAG/,
    )
  })

  test('falls back to the defaults for a blank optional variable', () => {
    const config = loadConfig({ ...VALID_ENV, AMAZON_MARKETPLACE: '  ' })
    expect(config.marketplace).toBe(DEFAULT_MARKETPLACE)
  })

  // A misconfigured CI job should surface all of its missing secrets in one
  // failed run instead of one per attempt.
  test('reports every missing variable at once', () => {
    let message = ''
    try {
      loadConfig({})
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('AMAZON_CREATOR_CREDENTIAL_ID')
    expect(message).toContain('AMAZON_CREATOR_SECRET')
    expect(message).toContain('AMAZON_AFFILIATE_TAG')
  })

  // Amazon retired PA-API v5 on 2026-05-15, so someone arriving with those
  // keys needs telling that they are not a substitute.
  test('explains the retired PA-API keys when only those are present', () => {
    expect(() => loadConfig({ AMAZON_API_KEY: 'AKIA...', AMAZON_API_SECRET: 'secret' })).toThrow(
      /PA-API v5 credentials/,
    )
  })

  test('leaves the PA-API note out when those keys are absent', () => {
    let message = ''
    try {
      loadConfig({})
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).not.toContain('PA-API')
  })

  test('rejects an unknown credential version before any request is made', () => {
    expect(() =>
      loadConfig({ ...VALID_ENV, AMAZON_CREATOR_CREDENTIAL_VERSION: '9.9' }),
    ).toThrow(/Unknown Creators API credential version/)
  })

  test('returns a frozen configuration', () => {
    expect(Object.isFrozen(loadConfig(VALID_ENV))).toBe(true)
  })
})
