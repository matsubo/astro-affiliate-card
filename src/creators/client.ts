// Creators API catalog client.
//
// One host serves every marketplace; the target store is selected with the
// `x-marketplace` header rather than a regional endpoint.

import { API_HOST, authorizationHeader, type CreatorsConfig } from './config.js'
import { type GetItemsResult, parseGetItemsResponse } from './parse.js'
import { buildGetItemsBody, GET_ITEMS_PATH } from './request.js'
import { type RetryOptions, withRetry } from './retry.js'
import type { TokenManager } from './token.js'

const MAX_ERROR_BODY_LENGTH = 300

export interface CreatorsClient {
  /** Fetches up to 10 ASINs in one call. */
  getItems(asins: readonly string[]): Promise<GetItemsResult>
}

export function createClient(
  config: CreatorsConfig,
  {
    fetchImpl = fetch,
    tokenManager,
    retry,
  }: { fetchImpl?: typeof fetch; tokenManager: TokenManager; retry?: RetryOptions },
): CreatorsClient {
  if (!tokenManager) throw new Error('createClient requires a tokenManager.')

  return {
    async getItems(asins) {
      const token = await tokenManager.get()
      const body = buildGetItemsBody(asins, {
        partnerTag: config.partnerTag,
        marketplace: config.marketplace,
      })

      let response: Response
      try {
        // The API throttles a --force run partway through; retrying beats
        // losing a batch of ten products to one 429.
        response = await withRetry(
          () =>
            fetchImpl(`${API_HOST}${GET_ITEMS_PATH}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Accept: 'application/json',
                Authorization: authorizationHeader(token, config.credentialVersion),
                'x-marketplace': config.marketplace,
              },
              body: JSON.stringify(body),
            }),
          retry,
        )
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Could not reach the Creators API catalog: ${reason}`)
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, MAX_ERROR_BODY_LENGTH)
        throw new Error(
          `getItems failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        )
      }

      return parseGetItemsResponse(await response.json())
    },
  }
}
