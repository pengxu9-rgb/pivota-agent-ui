import type { ProductResponse } from '@/lib/api'

export type ProductCardPresentation = {
  title: string
  subtitle: string | null
  highlight: string | null
  badge: string | null
}

export type ProductCardPresentationOptions = {
  allowDescriptionAlongsideSubtitle?: boolean
  suppressGenericReasonBadges?: boolean
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

function normalizeCompactComparisonText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^\w%+ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSurfaceText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed || trimmed.length > 40) return null
  return trimmed
}

function looksLikeEntityStyleCompactHighlight(value: string): boolean {
  const text = normalizeCompactComparisonText(value)
  if (!text) return true
  if (text.split(' ').length <= 1) return true
  if (
    /^(?:\d+%?\s+)?(?:niacinamide|vitamin c|retinol|peptide|azelaic acid(?: derivative)?|salicylic acid|hyaluronic acid)\s+(?:serum|moisturizer|cream|cleanser|lotion)$/i.test(
      text,
    )
  ) {
    return true
  }
  if (
    /^(?:spf(?:\s+\d+\+?)?|multi-active|amla brightening|brightening|hydrating|gentle|daily|color-correcting|multi-vitamin)\s+(?:serum|moisturizer|cream|cleanser|lotion|toner|sunscreen|body wash|mask|balm)$/i.test(
      text,
    )
  ) {
    return true
  }
  if (/^(?:color-correcting|brightening|hydrating)\s+eye\s+(?:stick|serum|cream)$/i.test(text)) {
    return true
  }
  if (
    /\b(serum|moisturizer|cream|cleanser|lotion|toner|mask|balm|sunscreen|body wash|eye stick|eye serum|eye cream|lip balm)$/.test(
      text,
    ) &&
    !/\b(with|for|under|over|against|without|in|from|instead|versus|vs)\b/.test(text) &&
    text.split(' ').length <= 4
  ) {
    return true
  }
  return false
}

function resolveDisplayableCompactHighlight(
  value: string | null,
  { title = '', subtitle = '' }: { title?: string; subtitle?: string } = {},
): string | null {
  const normalized = normalizeSurfaceText(value)
  if (!normalized) return null

  const normalizedHighlight = normalizeCompactComparisonText(normalized)
  const normalizedSubtitle = normalizeCompactComparisonText(subtitle)
  const normalizedTitle = normalizeCompactComparisonText(title)

  if (normalizedSubtitle && normalizedHighlight === normalizedSubtitle) return null
  if (normalizedTitle && normalizedHighlight === normalizedTitle) return null
  if (looksLikeEntityStyleCompactHighlight(normalized)) return null

  return normalized
}

function normalizeSurfaceTargets(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
}

function isSurfaceableExternalHighlightSignal(signal: Record<string, any>, surfaceTarget: string): boolean {
  if (!signal || typeof signal !== 'object') return false
  const surfaceText = normalizeSurfaceText(signal.surface_text) || normalizeSurfaceText(signal.claim_text)
  if (!surfaceText) return false

  const stance = String(signal.stance || 'positive').trim().toLowerCase()
  if (stance === 'negative') return false

  const targets = normalizeSurfaceTargets(signal.surface_targets)
  if (targets.length && !targets.includes(surfaceTarget)) return false

  if (signal.surfaceable === true) return true
  if (signal.surfaceable === false) return false

  const sourceType = String(signal.source_type || '').trim().toLowerCase()
  const sponsorshipStatus = String(signal.sponsorship_status || 'unknown').trim().toLowerCase()
  const evidenceStrength = String(signal.evidence_strength || 'weak').trim().toLowerCase()
  const independenceCount = Number(signal.independence_count || 0) || 0
  const reviewCount = Number(signal.rating_summary?.review_count || 0) || 0
  const hasSources = Array.isArray(signal.supporting_sources) && signal.supporting_sources.length > 0

  if (sourceType === 'verified_reviews') {
    return reviewCount > 0 || hasSources || independenceCount >= 1
  }
  if (sourceType === 'creator_social_consensus') {
    if (['sponsored', 'gifted'].includes(sponsorshipStatus)) return false
    if (!['moderate', 'strong'].includes(evidenceStrength)) return false
    return independenceCount >= 3
  }
  return false
}

function pickExternalCompactHighlight(product: ProductResponse): string | null {
  const rawDetail = product.raw_detail && typeof product.raw_detail === 'object' ? (product.raw_detail as Record<string, any>) : null
  const candidates = [
    ...(Array.isArray(product.external_highlight_signals) ? product.external_highlight_signals : []),
    ...(Array.isArray(product.shopping_card?.external_highlight_signals)
      ? product.shopping_card.external_highlight_signals
      : []),
    ...(Array.isArray(rawDetail?.external_highlight_signals) ? rawDetail.external_highlight_signals : []),
    ...(Array.isArray(rawDetail?.product_intel?.external_highlight_signals)
      ? rawDetail.product_intel.external_highlight_signals
      : []),
    ...(Array.isArray(rawDetail?.shopping_card?.external_highlight_signals)
      ? rawDetail.shopping_card.external_highlight_signals
      : []),
    ...(Array.isArray(rawDetail?.shoppingCard?.external_highlight_signals)
      ? rawDetail.shoppingCard.external_highlight_signals
      : []),
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    if (!isSurfaceableExternalHighlightSignal(candidate, 'shopping_card_highlight')) continue
    const text = normalizeSurfaceText(candidate.surface_text) || normalizeSurfaceText(candidate.claim_text)
    if (text) return text
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
  if (!formatted || /^(general|external)$/i.test(formatted)) return null
  return formatted.slice(0, 48)
}

function buildDescriptionHighlight(product: ProductResponse): string | null {
  const raw = readFirstString(
    (product as any).card_intro,
    product.description,
    (product as any).raw_detail?.seed_data?.derived?.recall?.retrieval_summary,
    (product as any).raw_detail?.seed_data?.snapshot?.description,
  )
  if (!raw) return null

  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0]?.trim() || normalized
  const candidate = firstSentence.length >= 28 ? firstSentence : normalized
  if (!candidate) return null
  return candidate
}

function buildVariantBadge(product: ProductResponse): string | null {
  const rawCount = Number(
    (product as any).variant_count ||
      (Array.isArray((product as any).variants) ? (product as any).variants.length : 0),
  )
  if (!Number.isFinite(rawCount) || rawCount < 2 || rawCount > 6) return null

  const optionName = readFirstString(
    (product as any).raw_detail?.seed_data?.snapshot?.variants?.[0]?.option_name,
    (product as any).variants?.[0]?.option_name,
  )
  if (optionName && /shade|color/i.test(optionName)) {
    return `${rawCount} shades`
  }
  if (optionName && /size|volume/i.test(optionName)) {
    return `${rawCount} sizes`
  }
  return `${rawCount} options`
}

function buildReasonBadge(
  product: ProductResponse,
  options: {
    hasSubtitle?: boolean
    suppressGenericReasonBadges?: boolean
  } = {},
): string | null {
  const reason = readFirstString((product as any).reason)
  if (!reason) return null
  if (reason.includes('same_brand')) {
    return options.suppressGenericReasonBadges ? null : 'Same brand'
  }
  if (reason.includes('same_category')) {
    if (options.suppressGenericReasonBadges || options.hasSubtitle) return null
    return 'Same category'
  }
  if (reason.includes('same_vertical')) {
    return options.suppressGenericReasonBadges ? null : 'Same routine'
  }
  if (reason.includes('semantic_peer')) return 'Similar pick'
  return null
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

export function resolveProductCardPresentation(
  product: ProductResponse,
  options: ProductCardPresentationOptions = {},
): ProductCardPresentation {
  const explicitTitle = readFirstString(
    product.card_title,
    product.search_card?.title_candidate,
  )
  const explicitSubtitle = readFirstString(
    product.card_subtitle,
    product.search_card?.compact_candidate,
  )
  const explicitHighlight = readFirstString(
    product.card_highlight,
    product.shopping_card?.highlight,
    product.search_card?.highlight_candidate,
  )
  const explicitBadge = readFirstString(
    product.card_badge,
    product.search_card?.proof_badge_candidate,
    product.market_signal_badges?.[0]?.badge_label,
  )
  const resolvedTitle = explicitTitle || String(product.title || '').trim() || 'Untitled product'
  const resolvedSubtitle = explicitSubtitle || buildCategorySubtitle(product)
  const descriptionHighlight = buildDescriptionHighlight(product)
  const explicitResolvedHighlight = resolveDisplayableCompactHighlight(explicitHighlight, {
    title: resolvedTitle,
    subtitle: resolvedSubtitle || '',
  })
  const externalResolvedHighlight = explicitResolvedHighlight
    ? null
    : resolveDisplayableCompactHighlight(pickExternalCompactHighlight(product), {
        title: resolvedTitle,
        subtitle: resolvedSubtitle || '',
      })
  const resolvedHighlight =
    explicitResolvedHighlight ||
    externalResolvedHighlight ||
    (options.allowDescriptionAlongsideSubtitle
      ? descriptionHighlight && descriptionHighlight !== resolvedSubtitle
        ? descriptionHighlight
        : null
      : !resolvedSubtitle
        ? descriptionHighlight
        : null)

  return {
    title: resolvedTitle,
    subtitle: resolvedSubtitle,
    highlight: resolvedHighlight,
    badge:
      explicitBadge ||
      buildReviewBadge(product) ||
      readConfiguredBadge(product) ||
      readBadgeFromTags(product) ||
      buildVariantBadge(product) ||
      buildReasonBadge(product, {
        hasSubtitle: Boolean(resolvedSubtitle),
        suppressGenericReasonBadges: options.suppressGenericReasonBadges,
      }),
  }
}
