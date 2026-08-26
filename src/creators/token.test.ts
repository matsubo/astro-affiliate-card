/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import { loadConfig, type CreatorsConfig } from './config.js'
import { createTokenManager } from './token.js'

const SECRET = 'super-secret-credential'

function config(credentialVersion = '3.3'): CreatorsConfig {
  return loadConfig({
    AMAZON_CREATOR_CREDENTIAL_ID: 'credential-id',
    AMAZON_CREATOR_SECRET: SECRET,
    AMAZON_AFFILIATE_TAG: 'triathlon01-22',
    AMAZON_CREATOR_CREDENTIAL_VERSION: credentialVersion,
  })
}

interface Call {
  url: string
  headers: Record<string, string>
  body: URLSearchParams
}

/** A fetch double that records every call and replies with the given token. */
function recordingFetch(
  reply: { access_token?: string; expires_in?: number } = { access_token: 'tok-1' },
) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: new URLSearchParams(String(init.body)),
    })
    return new Response(JSON.stringify(reply), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

describe('createTokenManager — request shape', () => {
  test('sends 3.x credentials as a Basic header against Login with Amazon', async () => {
    const { calls, fetchImpl } = recordingFetch()
    await createTokenManager(config('3.3'), { fetchImpl, now: () => 0 }).get()

    const call = calls[0]!
    expect(call.url).toBe('https://api.amazon.co.jp/auth/o2/token')
    expect(call.headers.Authorization).toBe(
      `Basic ${Buffer.from(`credential-id:${SECRET}`).toString('base64')}`,
    )
    expect(call.body.get('grant_type')).toBe('client_credentials')
    expect(call.body.get('scope')).toBe('creatorsapi::default')
    // The pair belongs in the header for this generation, not the form body.
    expect(call.body.get('client_secret')).toBeNull()
  })

  test('sends 2.x credentials in the form body against Cognito', async () => {
    const { calls, fetchImpl } = recordingFetch()
    await createTokenManager(config('2.3'), { fetchImpl, now: () => 0 }).get()

    const call = calls[0]!
    expect(call.url).toContain('amazoncognito.com')
    expect(call.headers.Authorization).toBeUndefined()
    expect(call.body.get('scope')).toBe('creatorsapi/default')
    expect(call.body.get('client_id')).toBe('credential-id')
    expect(call.body.get('client_secret')).toBe(SECRET)
  })
})

describe('createTokenManager — caching', () => {
  test('returns the minted token', async () => {
    const { fetchImpl } = recordingFetch({ access_token: 'tok-1', expires_in: 3600 })
    expect(await createTokenManager(config(), { fetchImpl, now: () => 0 }).get()).toBe('tok-1')
  })

  // Tokens live about an hour and Amazon expects them to be reused; minting one
  // per request would be both slower and rate-limited.
  test('reuses a token that has not expired', async () => {
    const { calls, fetchImpl } = recordingFetch({ access_token: 'tok-1', expires_in: 3600 })
    let clock = 0
    const manager = createTokenManager(config(), { fetchImpl, now: () => clock })

    await manager.get()
    clock = 3_000_000 // still inside the hour
    await manager.get()

    expect(calls).toHaveLength(1)
  })

  test('mints a new token once the old one has expired', async () => {
    const { calls, fetchImpl } = recordingFetch({ access_token: 'tok-1', expires_in: 3600 })
    let clock = 0
    const manager = createTokenManager(config(), { fetchImpl, now: () => clock })

    await manager.get()
    clock = 3_600_000
    await manager.get()

    expect(calls).toHaveLength(2)
  })

  // A token that expires in a minute would otherwise get an expiry in the past
  // once the leeway is subtracted, and be refetched on every single call.
  test('keeps half the lifetime for a token shorter than the expiry leeway', async () => {
    const { calls, fetchImpl } = recordingFetch({ access_token: 'tok-1', expires_in: 60 })
    let clock = 0
    const manager = createTokenManager(config(), { fetchImpl, now: () => clock })

    await manager.get()
    clock = 29_000
    await manager.get()

    expect(calls).toHaveLength(1)
  })

  test('assumes an hour when the reply omits expires_in', async () => {
    const { calls, fetchImpl } = recordingFetch({ access_token: 'tok-1' })
    let clock = 0
    const manager = createTokenManager(config(), { fetchImpl, now: () => clock })

    await manager.get()
    clock = 3_000_000
    await manager.get()

    expect(calls).toHaveLength(1)
  })

  // Batches are fetched in sequence today, but nothing in the contract says so;
  // a concurrent first use must not mint two tokens.
  test('collapses concurrent first uses onto one request', async () => {
    let calls = 0
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchImpl = (async () => {
      calls += 1
      await gate
      return new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }))
    }) as unknown as typeof fetch

    const manager = createTokenManager(config(), { fetchImpl, now: () => 0 })
    const both = Promise.all([manager.get(), manager.get()])
    release!()

    expect(await both).toEqual(['tok-1', 'tok-1'])
    expect(calls).toBe(1)
  })
})

describe('createTokenManager — failures', () => {
  function failingFetch(response: Response | Error) {
    return (async () => {
      if (response instanceof Error) throw response
      return response
    }) as unknown as typeof fetch
  }

  test('names the endpoint when it cannot be reached at all', async () => {
    const fetchImpl = failingFetch(new Error('getaddrinfo ENOTFOUND'))
    const manager = createTokenManager(config(), { fetchImpl, now: () => 0 })
    await expect(manager.get()).rejects.toThrow(
      /Could not reach the Creators API token endpoint .*ENOTFOUND/,
    )
  })

  test('reports the status and points at the likely cause', async () => {
    const fetchImpl = failingFetch(new Response('invalid_client', { status: 401 }))
    const manager = createTokenManager(config(), { fetchImpl, now: () => 0 })
    await expect(manager.get()).rejects.toThrow(/HTTP 401: invalid_client/)
    await expect(manager.get()).rejects.toThrow(/credential version \(3\.3\)/)
  })

  // This message reaches CI logs, which are readable by anyone with repository
  // access. A leaked credential there is a rotation, not a retry.
  test('never puts the credential pair in the error message', async () => {
    const fetchImpl = failingFetch(new Response('invalid_client', { status: 401 }))
    const manager = createTokenManager(config(), { fetchImpl, now: () => 0 })

    const error = await manager.get().catch((e: Error) => e)
    expect((error as Error).message).not.toContain(SECRET)
    expect((error as Error).message).not.toContain('credential-id')
  })

  test('truncates a long error body rather than dumping the whole page', async () => {
    const fetchImpl = failingFetch(new Response('x'.repeat(5000), { status: 500 }))
    const manager = createTokenManager(config(), { fetchImpl, now: () => 0 })

    const error = (await manager.get().catch((e: Error) => e)) as Error
    expect(error.message).toContain('x'.repeat(300))
    expect(error.message).not.toContain('x'.repeat(301))
  })

  test('rejects a 200 reply that carries no token', async () => {
    const fetchImpl = failingFetch(new Response(JSON.stringify({ token_type: 'bearer' })))
    const manager = createTokenManager(config(), { fetchImpl, now: () => 0 })
    await expect(manager.get()).rejects.toThrow(/no access_token/)
  })

  // A failed mint must not poison the manager: the next call retries instead of
  // handing back a stale or absent token.
  test('retries after a failure instead of caching it', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls === 1) return new Response('throttled', { status: 429 })
      return new Response(JSON.stringify({ access_token: 'tok-2', expires_in: 3600 }))
    }) as unknown as typeof fetch

    const manager = createTokenManager(config(), { fetchImpl, now: () => 0 })
    await expect(manager.get()).rejects.toThrow(/HTTP 429/)
    expect(await manager.get()).toBe('tok-2')
    expect(calls).toBe(2)
  })
})
