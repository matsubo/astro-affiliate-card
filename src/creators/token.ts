// OAuth2 access tokens for the Creators API.
//
// Tokens live about an hour. Amazon expects them to be cached and reused, so
// this mints one on first use and holds it in memory for the process lifetime;
// nothing is written to disk.

import { type CreatorsConfig, SCOPE_COGNITO, SCOPE_LWA, usesLoginWithAmazon } from './config.js'

const EXPIRY_LEEWAY_MS = 60_000
const MAX_ERROR_BODY_LENGTH = 300

export interface TokenManager {
  get(): Promise<string>
}

export interface TokenManagerDeps {
  fetchImpl?: typeof fetch
  now?: () => number
}

function buildTokenRequest(config: CreatorsConfig): {
  body: URLSearchParams
  headers: Record<string, string>
} {
  const body = new URLSearchParams({ grant_type: 'client_credentials' })

  if (usesLoginWithAmazon(config.credentialVersion)) {
    body.set('scope', SCOPE_LWA)
    const pair = `${config.credentialId}:${config.credentialSecret}`
    return {
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(pair).toString('base64')}`,
      },
    }
  }

  // Cognito (2.x) takes the credential pair in the form body instead.
  body.set('scope', SCOPE_COGNITO)
  body.set('client_id', config.credentialId)
  body.set('client_secret', config.credentialSecret)
  return {
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  }
}

/** Creates a token manager that fetches on first use and caches until expiry. */
export function createTokenManager(
  config: CreatorsConfig,
  { fetchImpl = fetch, now = Date.now }: TokenManagerDeps = {},
): TokenManager {
  let accessToken: string | null = null
  let expiresAt = 0
  let inFlight: Promise<string> | null = null

  async function requestToken(): Promise<string> {
    const { body, headers } = buildTokenRequest(config)

    let response: Response
    try {
      response = await fetchImpl(config.tokenEndpoint, {
        method: 'POST',
        headers,
        body: body.toString(),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Could not reach the Creators API token endpoint (${config.tokenEndpoint}): ${reason}`,
      )
    }

    if (!response.ok) {
      // Never interpolate the credential pair here — this reaches CI logs.
      const detail = (await response.text().catch(() => '')).slice(0, MAX_ERROR_BODY_LENGTH)
      throw new Error(
        `Creators API token request failed with HTTP ${response.status}` +
          `${detail ? `: ${detail}` : ''}\n` +
          'Check AMAZON_CREATOR_CREDENTIAL_ID / AMAZON_CREATOR_SECRET, and that the credential ' +
          `version (${config.credentialVersion}) matches the pair issued in Associates Central.`,
      )
    }

    const payload = (await response.json()) as { access_token?: string; expires_in?: number }
    if (!payload?.access_token) {
      throw new Error('Creators API token response contained no access_token.')
    }

    const lifetimeMs = (Number(payload.expires_in) || 3600) * 1000
    accessToken = payload.access_token
    expiresAt = now() + Math.max(lifetimeMs - EXPIRY_LEEWAY_MS, lifetimeMs / 2)
    return accessToken
  }

  return {
    async get(): Promise<string> {
      if (accessToken && now() < expiresAt) return accessToken

      // Collapse concurrent refreshes onto one request.
      inFlight ??= requestToken().finally(() => {
        inFlight = null
      })

      try {
        return await inFlight
      } catch (error) {
        accessToken = null
        expiresAt = 0
        throw error
      }
    },
  }
}
