/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import { createClient } from './client.js'
import { type CreatorsConfig, loadConfig } from './config.js'
import type { TokenManager } from './token.js'

function config(credentialVersion = '3.3', marketplace = 'www.amazon.co.jp'): CreatorsConfig {
  return loadConfig({
    AMAZON_CREATOR_CREDENTIAL_ID: 'credential-id',
    AMAZON_CREATOR_SECRET: 'credential-secret',
    AMAZON_AFFILIATE_TAG: 'triathlon01-22',
    AMAZON_CREATOR_CREDENTIAL_VERSION: credentialVersion,
    AMAZON_MARKETPLACE: marketplace,
  })
}

const tokenManager: TokenManager = {
  async get() {
    return 'tok-1'
  },
}

const ITEM = {
  asin: 'B00TQMO5E0',
  detailPageUrl: 'https://www.amazon.co.jp/dp/B00TQMO5E0',
  itemInfo: { title: { displayValue: 'Mag-on エナジージェル' } },
}

interface Call {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function recordingFetch(reply: unknown = { itemsResult: { items: [ITEM] } }) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    })
    return new Response(JSON.stringify(reply), { status: 200 })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

describe('createClient', () => {
  test('refuses to be built without a token manager', () => {
    expect(() =>
      createClient(config(), { tokenManager: undefined as unknown as TokenManager }),
    ).toThrow(/requires a tokenManager/)
  })
})

describe('getItems — request', () => {
  test('posts the catalog request to the single Creators API host', async () => {
    const { calls, fetchImpl } = recordingFetch()
    await createClient(config(), { fetchImpl, tokenManager }).getItems(['B00TQMO5E0'])
    expect(calls[0]!.url).toBe('https://creatorsapi.amazon/catalog/v1/getItems')
  })

  // One host serves every marketplace; the store is selected by header rather
  // than by a regional endpoint, so getting this wrong silently queries .com.
  test('selects the marketplace with the x-marketplace header', async () => {
    const { calls, fetchImpl } = recordingFetch()
    await createClient(config('3.3', 'www.amazon.com'), { fetchImpl, tokenManager }).getItems([
      'B00TQMO5E0',
    ])
    expect(calls[0]!.headers['x-marketplace']).toBe('www.amazon.com')
    expect(calls[0]!.body.marketplace).toBe('www.amazon.com')
  })

  test('carries the bearer token in the shape the credential generation expects', async () => {
    const lwa = recordingFetch()
    await createClient(config('3.3'), { fetchImpl: lwa.fetchImpl, tokenManager }).getItems(['B0'])
    expect(lwa.calls[0]!.headers.Authorization).toBe('Bearer tok-1')

    const cognito = recordingFetch()
    await createClient(config('2.3'), { fetchImpl: cognito.fetchImpl, tokenManager }).getItems([
      'B0',
    ])
    expect(cognito.calls[0]!.headers.Authorization).toBe('Bearer tok-1, Version 2.3')
  })

  test('sends the ASINs and the partner tag in the body', async () => {
    const { calls, fetchImpl } = recordingFetch()
    await createClient(config(), { fetchImpl, tokenManager }).getItems(['B00TQMO5E0', 'B003ER7K0E'])
    expect(calls[0]!.body).toMatchObject({
      itemIds: ['B00TQMO5E0', 'B003ER7K0E'],
      itemIdType: 'ASIN',
      partnerTag: 'triathlon01-22',
    })
  })

  test('mints a token before every call, letting the manager decide on reuse', async () => {
    let tokenCalls = 0
    const counting: TokenManager = {
      async get() {
        tokenCalls += 1
        return 'tok-1'
      },
    }
    const { fetchImpl } = recordingFetch()
    const client = createClient(config(), { fetchImpl, tokenManager: counting })
    await client.getItems(['B0'])
    await client.getItems(['B1'])
    expect(tokenCalls).toBe(2)
  })

  // A token that cannot be minted must surface as itself, not as a confusing
  // catalog error.
  test('propagates a token failure untouched', async () => {
    const failing: TokenManager = {
      async get() {
        throw new Error('HTTP 401 from the token endpoint')
      },
    }
    const { fetchImpl } = recordingFetch()
    const client = createClient(config(), { fetchImpl, tokenManager: failing })
    await expect(client.getItems(['B0'])).rejects.toThrow('HTTP 401 from the token endpoint')
  })
})

describe('getItems — response', () => {
  test('returns the parsed products', async () => {
    const { fetchImpl } = recordingFetch()
    const result = await createClient(config(), { fetchImpl, tokenManager }).getItems([
      'B00TQMO5E0',
    ])
    expect(result.products.B00TQMO5E0?.title).toBe('Mag-on エナジージェル')
    expect(result.errors).toEqual([])
  })

  test('reports the status and body of a failed call', async () => {
    const fetchImpl = (async () =>
      new Response('AccessDenied', { status: 403 })) as unknown as typeof fetch
    const client = createClient(config(), { fetchImpl, tokenManager })
    await expect(client.getItems(['B0'])).rejects.toThrow(
      /getItems failed with HTTP 403: AccessDenied/,
    )
  })

  test('truncates a long error body', async () => {
    const fetchImpl = (async () =>
      new Response('x'.repeat(5000), { status: 500 })) as unknown as typeof fetch
    // One attempt: this checks the error text, not the retry behaviour.
    const client = createClient(config(), { fetchImpl, tokenManager, retry: { attempts: 1 } })
    const error = (await client.getItems(['B0']).catch((e: Error) => e)) as Error
    expect(error.message).toContain('x'.repeat(300))
    expect(error.message).not.toContain('x'.repeat(301))
  })

  // A body that cannot be read must not turn an HTTP error into an unrelated
  // one; the status is the part worth reporting either way.
  test('still reports the status when the error body cannot be read', async () => {
    const broken = new Response('unreadable', { status: 503 })
    Object.defineProperty(broken, 'text', {
      value: () => Promise.reject(new Error('body already consumed')),
    })
    const fetchImpl = (async () => broken) as unknown as typeof fetch
    // One attempt: this checks the error text, not the retry behaviour.
    const client = createClient(config(), { fetchImpl, tokenManager, retry: { attempts: 1 } })
    await expect(client.getItems(['B0'])).rejects.toThrow('getItems failed with HTTP 503')
  })

  test('wraps a network failure with what was being attempted', async () => {
    const fetchImpl = (async () => {
      throw new Error('socket hang up')
    }) as unknown as typeof fetch
    const client = createClient(config(), { fetchImpl, tokenManager })
    await expect(client.getItems(['B0'])).rejects.toThrow(
      /Could not reach the Creators API catalog: socket hang up/,
    )
  })
})
