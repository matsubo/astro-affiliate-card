// Card markup. Emitted as an HTML string because a remark plugin cannot carry
// scoped component styles, so this stays in sync with card.css by convention.
//
// Ported from impreza-gdb, with that site's HUD theme lifted out: the classes
// and wording here are neutral, and a site restores its own voice through
// CardLabels rather than by forking this file.

import type { ShopLinks } from './shops'
import { extractAsin } from './shops'

export interface AmazonCardData {
  /** Destination of the main link — the Creators API detail URL when known. */
  url: string
  asin?: string | null
  title?: string
  image?: string
  price?: string
  listPrice?: string
  description?: string
  rating?: number
  reviewCount?: number
}

/** Per-site wording and theming. Every field has a neutral default. */
export interface CardLabels {
  /**
   * Advertising disclosure shown above the title. Defaults to 「PR」 and should
   * only be changed to different wording, never emptied: Japanese ステマ規制
   * requires affiliate placements to be disclosed.
   */
  kicker?: string
  /** Label for the non-Amazon shop row. */
  shopsLabel?: string
  /** Call to action on the main link. */
  cta?: string
  /** Whether to print the ASIN. */
  showAsin?: boolean
  /** Extra class on the card root, for a site's own skin. */
  frameClass?: string
}

const DEFAULT_LABELS = {
  kicker: 'PR',
  shopsLabel: '他で探す',
  cta: 'Amazonで見る',
  showAsin: true,
  frameClass: '',
} as const satisfies Required<CardLabels>

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Amazon smile mark, used when a product has no image. */
const AMAZON_MARK_SVG = `<svg class="amazon-card__mark" width="64" height="38" viewBox="0 0 100 60" fill="currentColor" aria-hidden="true"><path d="M63.3 49.9c-8.5 6.3-20.8 9.6-31.5 9.6-14.9 0-28.3-5.5-38.5-14.7-.8-.7-.1-1.7.9-1.1 10.8 6.3 24.1 10.1 37.9 10.1 9.3 0 19.5-1.9 28.9-5.9 1.4-.6 2.6.9 1.2 1.9l1.1.1z"/><path d="M66.5 46.2c-1.1-1.4-7.2-.7-10-.3-.8.1-1-.6-.2-1.1 4.9-3.4 12.9-2.4 13.8-1.3.9 1.2-.2 9.2-4.8 13-.7.6-1.4.3-1.1-.5 1-2.6 3.3-8.4 2.3-9.8z"/></svg>`

const ARROW_SVG = `<svg class="amazon-card__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7"/></svg>`

const OUTBOUND_REL = 'rel="nofollow noopener noreferrer sponsored"'

function renderRating(rating: number, reviewCount: number): string {
  if (rating <= 0) return ''
  const stars = Array.from({ length: 5 }, (_, i) =>
    i < Math.round(rating)
      ? '<span class="amazon-card__star--filled">★</span>'
      : '<span class="amazon-card__star--empty">★</span>',
  ).join('')
  const count = reviewCount > 0 ? ` (${reviewCount.toLocaleString('ja-JP')}件)` : ''
  return `<span class="amazon-card__rating"><span class="amazon-card__stars" aria-hidden="true">${stars}</span><span class="amazon-card__rating-value">${rating.toFixed(1)}${count}</span></span>`
}

function renderPrices(price?: string, listPrice?: string): string {
  if (!price && !listPrice) return ''
  const current = price
    ? `<span class="amazon-card__price">${escapeHtml(price)}</span>`
    : ''
  const original =
    listPrice && listPrice !== price
      ? `<span class="amazon-card__list-price">${escapeHtml(listPrice)}</span>`
      : ''
  return `<span class="amazon-card__readout">${current}${original}</span>`
}

function renderShops(links: ShopLinks, shopsLabel: string): string {
  const buttons: string[] = []

  if (links.rakutenUrl) {
    buttons.push(
      `<a class="amazon-card__shop amazon-card__shop--rakuten" href="${escapeHtml(links.rakutenUrl)}" target="_blank" ${OUTBOUND_REL}>楽天で探す</a>`,
    )
  }

  if (links.yahooUrl) {
    // ValueCommerce records the impression through this 1x1 gif; without it a
    // MyLink referral is untracked.
    const beacon = links.yahooBeaconUrl
      ? `<img src="${escapeHtml(links.yahooBeaconUrl)}" width="1" height="1" alt="" class="amazon-card__vc-beacon" />`
      : ''
    buttons.push(
      `<a class="amazon-card__shop amazon-card__shop--yahoo" href="${escapeHtml(links.yahooUrl)}" target="_blank" ${OUTBOUND_REL}>${beacon}Yahoo!で探す</a>`,
    )
  }

  if (buttons.length === 0) return ''
  return `<div class="amazon-card__shops"><span class="amazon-card__shops-label">${escapeHtml(shopsLabel)}</span>${buttons.join('')}</div>`
}

export function renderAmazonCard(
  data: AmazonCardData,
  shops: ShopLinks,
  labels: CardLabels = {},
): string {
  const { kicker, shopsLabel, cta, showAsin, frameClass } = { ...DEFAULT_LABELS, ...labels }

  const safeTitle = escapeHtml(data.title || 'Amazon商品リンク')
  const asin = data.asin ?? extractAsin(data.url)

  const media = data.image
    ? `<span class="amazon-card__media"><img src="${escapeHtml(data.image)}" alt="${safeTitle}" loading="lazy" /></span>`
    : `<span class="amazon-card__media amazon-card__media--empty">${AMAZON_MARK_SVG}</span>`

  const description = data.description
    ? `<span class="amazon-card__description">${escapeHtml(data.description)}</span>`
    : ''

  const asinTag =
    showAsin && asin ? `<span class="amazon-card__asin">ASIN ${escapeHtml(asin)}</span>` : ''

  const rootClass = ['amazon-card', frameClass].filter(Boolean).join(' ')

  return `<div class="${rootClass}">
  <a class="amazon-card__link" href="${escapeHtml(data.url)}" target="_blank" ${OUTBOUND_REL}>
    ${media}
    <span class="amazon-card__body">
      <span class="amazon-card__kicker"><span class="amazon-card__kicker-tag">${escapeHtml(kicker)}</span>${asinTag}</span>
      <span class="amazon-card__title">${safeTitle}</span>
      ${renderRating(data.rating ?? 0, data.reviewCount ?? 0)}
      ${description}
      ${renderPrices(data.price, data.listPrice)}
      <span class="amazon-card__cta"><span class="amazon-card__cta-text">${escapeHtml(cta)}</span>${ARROW_SVG}</span>
    </span>
  </a>
  ${renderShops(shops, shopsLabel)}
</div>`
}
