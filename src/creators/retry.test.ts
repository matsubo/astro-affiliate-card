/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import { withRetry } from './retry.js'

function throttled(): Response {
  return new Response('{"type":"ThrottleException"}', { status: 429 })
}

describe('withRetry', () => {
  test('returns the first success untouched', async () => {
    const res = await withRetry(async () => new Response('ok', { status: 200 }), { sleep: async () => {} })
    expect(res.status).toBe(200)
  })

  // The Creators API throttles hard on a --force run across a few hundred
  // ASINs. Giving up on the first 429 loses a whole batch of ten products.
  test('retries a 429 until it succeeds', async () => {
    let calls = 0
    const res = await withRetry(
      async () => {
        calls += 1
        return calls < 3 ? throttled() : new Response('ok', { status: 200 })
      },
      { sleep: async () => {} },
    )
    expect(calls).toBe(3)
    expect(res.status).toBe(200)
  })

  test('backs off for longer on each attempt', async () => {
    const waits: number[] = []
    await withRetry(async () => throttled(), {
      attempts: 4,
      sleep: async (ms) => {
        waits.push(ms)
      },
    })
    expect(waits.length).toBe(3)
    for (let i = 1; i < waits.length; i += 1) expect(waits[i]!).toBeGreaterThan(waits[i - 1]!)
  })

  test('honours Retry-After when the server sends one', async () => {
    const waits: number[] = []
    await withRetry(
      async () => new Response('', { status: 429, headers: { 'retry-after': '7' } }),
      { attempts: 2, sleep: async (ms) => { waits.push(ms) } },
    )
    expect(waits[0]).toBe(7000)
  })

  test('gives the throttled response back once attempts run out', async () => {
    const res = await withRetry(async () => throttled(), { attempts: 2, sleep: async () => {} })
    expect(res.status).toBe(429)
  })

  test('does not retry a client error that will never succeed', async () => {
    let calls = 0
    const res = await withRetry(
      async () => {
        calls += 1
        return new Response('nope', { status: 401 })
      },
      { sleep: async () => {} },
    )
    expect(calls).toBe(1)
    expect(res.status).toBe(401)
  })

  // The default sleep is what a real sync uses; every other test injects one, so
  // nothing exercised it. Retry-After: 0 keeps the wait at a real setTimeout(0).
  test('waits on its own when no sleep is injected', async () => {
    let calls = 0
    const res = await withRetry(
      async () => {
        calls += 1
        return calls < 2
          ? new Response('', { status: 503, headers: { 'retry-after': '0' } })
          : new Response('ok', { status: 200 })
      },
      { attempts: 2 },
    )

    expect(calls).toBe(2)
    expect(res.status).toBe(200)
  })
})
