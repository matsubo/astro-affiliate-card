// Retry for the Creators API's rate limiting.
//
// A `--force` run asks about every ASIN a site uses, which for a few hundred
// products is enough to trip the throttle partway through. Without a retry a
// single 429 loses a whole batch of ten products for that run.

/** Status codes worth trying again: throttling and transient server faults. */
const RETRYABLE = new Set([429, 500, 502, 503, 504])

const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 30_000

export interface RetryOptions {
  /** Total attempts, including the first. */
  attempts?: number
  sleep?: (ms: number) => Promise<void>
  onRetry?: (info: { attempt: number; status: number; waitMs: number }) => void
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Exponential backoff, unless the server named a delay of its own. */
function delayFor(attempt: number, response: Response): number {
  const header = response.headers.get('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  }
  return Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
}

/**
 * Runs `request`, retrying while it comes back throttled or briefly broken.
 *
 * Returns the last response either way — the caller decides what a persistent
 * failure means, which for a sync is "keep whatever this ASIN already had"
 * rather than an error.
 */
export async function withRetry(
  request: () => Promise<Response>,
  { attempts = 4, sleep = defaultSleep, onRetry }: RetryOptions = {},
): Promise<Response> {
  let response = await request()

  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (!RETRYABLE.has(response.status)) return response

    const waitMs = delayFor(attempt, response)
    onRetry?.({ attempt, status: response.status, waitMs })
    await sleep(waitMs)
    response = await request()
  }

  return response
}
