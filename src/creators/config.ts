// Configuration for the Amazon Creators API.
//
// The Creators API replaced Product Advertising API v5, which Amazon retired on
// 2026-05-15. Credentials come from Associates Central > Tools > Creators API
// and are a Credential ID / Secret pair — PA-API access keys do not work here.
//
// Two credential generations are in circulation, and which one you hold depends
// on when the credential was issued:
//
//   2.x  OAuth2 against a regional Cognito pool. Credentials go in the form
//        body, and the catalog request carries
//        `Authorization: Bearer <t>, Version <v>`.
//   3.x  OAuth2 against Login with Amazon. Credentials go in a Basic header,
//        and the catalog request carries a plain `Authorization: Bearer <t>`.
//
// Japan-issued credentials are 3.3 today, so that is the default.

export const DEFAULT_MARKETPLACE = 'www.amazon.co.jp'
export const DEFAULT_CREDENTIAL_VERSION = '3.3'
export const API_HOST = 'https://creatorsapi.amazon'

export const CREDENTIAL_VERSIONS = Object.freeze({
  NA_V2: '2.1',
  EU_V2: '2.2',
  FE_V2: '2.3',
  NA_V3: '3.1',
  EU_V3: '3.2',
  FE_V3: '3.3',
})

const TOKEN_ENDPOINTS: Record<string, string> = Object.freeze({
  [CREDENTIAL_VERSIONS.NA_V2]: 'https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token',
  [CREDENTIAL_VERSIONS.EU_V2]: 'https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token',
  [CREDENTIAL_VERSIONS.FE_V2]: 'https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token',
  [CREDENTIAL_VERSIONS.NA_V3]: 'https://api.amazon.com/auth/o2/token',
  [CREDENTIAL_VERSIONS.EU_V3]: 'https://api.amazon.co.uk/auth/o2/token',
  [CREDENTIAL_VERSIONS.FE_V3]: 'https://api.amazon.co.jp/auth/o2/token',
})

/** OAuth2 scope differs between the two credential generations. */
export const SCOPE_COGNITO = 'creatorsapi/default'
export const SCOPE_LWA = 'creatorsapi::default'

export interface CreatorsConfig {
  credentialId: string
  credentialSecret: string
  partnerTag: string
  marketplace: string
  credentialVersion: string
  tokenEndpoint: string
}

export function resolveTokenEndpoint(credentialVersion: string): string {
  const endpoint = TOKEN_ENDPOINTS[credentialVersion]
  if (!endpoint) {
    const known = Object.keys(TOKEN_ENDPOINTS).join(', ')
    throw new Error(
      `Unknown Creators API credential version "${credentialVersion}". Known versions: ${known}.`,
    )
  }
  return endpoint
}

export function usesLoginWithAmazon(credentialVersion: string): boolean {
  return credentialVersion.startsWith('3.')
}

export function authorizationHeader(token: string, credentialVersion: string): string {
  return usesLoginWithAmazon(credentialVersion)
    ? `Bearer ${token}`
    : `Bearer ${token}, Version ${credentialVersion}`
}

const REQUIRED_VARS = [
  'AMAZON_CREATOR_CREDENTIAL_ID',
  'AMAZON_CREATOR_SECRET',
  'AMAZON_AFFILIATE_TAG',
] as const

/**
 * Builds the run configuration from environment variables.
 *
 * Reports every problem at once, so a misconfigured CI job surfaces all of its
 * missing secrets in a single failed run instead of one per attempt.
 */
export function loadConfig(env: Record<string, string | undefined>): Readonly<CreatorsConfig> {
  const missing = REQUIRED_VARS.filter((name) => !env[name]?.trim())

  if (missing.length > 0) {
    const hasLegacyKeys = Boolean(env.AMAZON_API_KEY?.trim() || env.AMAZON_API_SECRET?.trim())
    const legacyNote = hasLegacyKeys
      ? '\n\nAMAZON_API_KEY / AMAZON_API_SECRET are PA-API v5 credentials. Amazon retired\n' +
        'that API on 2026-05-15 and its keys do not work here. Issue a Creators API\n' +
        'credential pair in Associates Central > Tools > Creators API.'
      : ''
    throw new Error(
      `Missing Creators API configuration: ${missing.join(', ')}.\n\n` +
        'Set these in .env (or as CI secrets):\n' +
        '  AMAZON_CREATOR_CREDENTIAL_ID=<Credential ID>\n' +
        '  AMAZON_CREATOR_SECRET=<Credential Secret>\n' +
        '  AMAZON_AFFILIATE_TAG=<your-tag-22>\n' +
        `  AMAZON_CREATOR_CREDENTIAL_VERSION=${DEFAULT_CREDENTIAL_VERSION}  # optional\n` +
        `  AMAZON_MARKETPLACE=${DEFAULT_MARKETPLACE}  # optional` +
        legacyNote,
    )
  }

  const credentialVersion =
    env.AMAZON_CREATOR_CREDENTIAL_VERSION?.trim() || DEFAULT_CREDENTIAL_VERSION

  return Object.freeze({
    credentialId: env.AMAZON_CREATOR_CREDENTIAL_ID!.trim(),
    credentialSecret: env.AMAZON_CREATOR_SECRET!.trim(),
    partnerTag: env.AMAZON_AFFILIATE_TAG!.trim(),
    marketplace: env.AMAZON_MARKETPLACE?.trim() || DEFAULT_MARKETPLACE,
    credentialVersion,
    tokenEndpoint: resolveTokenEndpoint(credentialVersion),
  })
}
