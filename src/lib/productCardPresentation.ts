import type { ProductResponse } from '@/lib/api'

export type ProductCardPresentation = {
  title: string
  subtitle: string | null
  badge: string | null
}

function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0'
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}m`
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`
  return String(Math.round(count))
}

function readFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return null
}

function getReviewMeta(product: ProductResponse) {
  const summary =
    product?.review_summary && typeof product.review_summary === 'object'
      ? product.review_summary
      : null
  const scale = Number(summary?.scale || summary?.rating_scale || 5) || 5
  const rawRating = Number(summary?.rating || summary?.average_rating || summary?.avg_rating || 0) || 0
  const normalizedRating =
    rawRating > 0 ? Math.min(5, scale === 5 ? rawRating : (rawRating / scale) * 5) : null
  const reviewCount = Number(summary?.review_count || summary?.count || summary?.total_reviews || 0) || 0
  return {
    rating: normalizedRating,
    reviewCount,
  }
}

function formatCategoryLabel(label: string): string {
  return label
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildCategorySubtitle(product: ProductResponse): string | null {
  const raw = readFirstString(product.product_type, product.category, product.department)
  if (!raw) return null
  const formatted = formatCategoryLabel(raw)
  if (!formatted || /^general$/i.test(formatted)) return null
  return formatted.slice(0, 48)
}

function buildReviewBadge(product: ProductResponse): string | null {
  const { rating, reviewCount } = getReviewMeta(product)
  if ((rating || 0) >= 4.5 && reviewCount >= 100) {
    return `${rating?.toFixed(1)}★ (${formatCompactCount(reviewCount)})`
  }
  return null
}

function readConfiguredBadge(product: ProductResponse): string | null {
  const rawDetail =
    product.raw_detail && typeof product.raw_detail === 'object'
      ? (product.raw_detail as Record<string, any>)
      : null
  const attributes =
    product.attributes && typeof product.attributes === 'object'
      ? (product.attributes as Record<string, any>)
      : null
  const merchandising =
    rawDetail?.merchandising && typeof rawDetail.merchandising === 'object'
      ? (rawDetail.merchandising as Record<string, any>)
      : null

  return readFirstString(
    merchandising?.card_callout,
    merchandising?.card_label,
    merchandising?.editorial_badge,
    merchandising?.badge,
    attributes?.card_callout,
    attributes?.card_label,
    attributes?.editorial_badge,
    attributes?.badge,
    rawDetail?.card_callout,
    rawDetail?.card_label,
    rawDetail?.editorial_badge,
    rawDetail?.badge,
  )
}

function formatBadgeLabel(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => {
      if (!token) return token
      if (/^[A-Z0-9]+$/.test(token)) return token
      return token.charAt(0).toUpperCase() + token.slice(1)
    })
    .join(' ')
}

function readBadgeFromTags(product: ProductResponse): string | null {
  const tags = Array.isArray(product.tags) ? product.tags : []
  for (const rawTag of tags) {
    if (typeof rawTag !== 'string') continue
    const tag = rawTag.trim()
    if (!tag) continue
    const match = tag.match(/^(editorial|media|award|creator)\s*:\s*(.+)$/i)
    if (!match) continue
    const label = formatBadgeLabel(match[2] || '')
    if (label) return label
  }
  return null
}

export function resolveProductCardPresentation(product: ProductResponse): ProductCardPresentation {
  const explicitTitle = readFirstString(
    product.card_title,
    product.search_card?.title_candidate,
  )
  const explicitSubtitle = readFirstString(
    product.card_subtitle,
    product.search_card?.compact_candidate,
  )
  const explicitBadge = readFirstString(
    product.card_badge,
    product.search_card?.proof_badge_candidate,
    product.market_signal_badges?.[0]?.badge_label,
  )

  return {
    title: explicitTitle || String(product.title || '').trim() || 'Untitled product',
    subtitle: explicitSubtitle || buildCategorySubtitle(product),
    badge:
      explicitBadge ||
      buildReviewBadge(product) ||
      readConfiguredBadge(product) ||
      readBadgeFromTags(product),
  }
}
