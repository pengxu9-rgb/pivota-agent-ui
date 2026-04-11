import { describe, expect, it } from 'vitest'

import type { ProductResponse } from '@/lib/api'
import { resolveProductCardPresentation } from './productCardPresentation'

describe('resolveProductCardPresentation', () => {
  it('prefers explicit normalized search-card fields', () => {
    const product = {
      product_id: 'prod_1',
      title: 'Air Max Special Edition',
      description: 'Legacy overview',
      price: 120,
      currency: 'USD',
      in_stock: true,
      card_title: 'Nike Air Max Running Shoes',
      card_subtitle: 'Men’s black air-cushion sneaker',
      card_highlight: 'Celebrity-styled black sneaker',
      card_badge: 'Seen in 4 editor picks',
    } satisfies ProductResponse

    expect(resolveProductCardPresentation(product)).toEqual({
      title: 'Nike Air Max Running Shoes',
      subtitle: 'Men’s black air-cushion sneaker',
      highlight: 'Celebrity-styled black sneaker',
      badge: 'Seen in 4 editor picks',
    })
  })

  it('falls back to compact review badge and category subtitle', () => {
    const product = {
      product_id: 'prod_2',
      title: 'Gloss Bomb',
      description: 'Lip luminizer',
      price: 26,
      currency: 'USD',
      in_stock: true,
      category: 'lip gloss',
      review_summary: {
        rating: 4.8,
        review_count: 128,
      },
    } satisfies ProductResponse

    expect(resolveProductCardPresentation(product)).toEqual({
      title: 'Gloss Bomb',
      subtitle: 'Lip Gloss',
      highlight: null,
      badge: '4.8★ (128)',
    })
  })

  it('reads editorial-style badge labels from structured tags when explicit card fields are absent', () => {
    const product = {
      product_id: 'prod_3',
      title: 'Match Stix Skinstick',
      description: 'Complexion',
      price: 32,
      currency: 'USD',
      in_stock: true,
      category: 'complexion',
      tags: ["editorial: rihanna's pick"],
    } satisfies ProductResponse

    expect(resolveProductCardPresentation(product)).toEqual({
      title: 'Match Stix Skinstick',
      subtitle: 'Complexion',
      highlight: null,
      badge: "Rihanna's Pick",
    })
  })

  it('falls back to compact description copy and variant-count badge for minimally structured products', () => {
    const product = {
      product_id: 'prod_4',
      title: 'Oat So Simple Water Cream',
      description:
        'A lightweight moisturizer formulated with Oat Extract that effectively soothes and hydrates skin with less than 10 ingredients.',
      price: 28,
      currency: 'EUR',
      in_stock: true,
      product_type: 'external',
      variant_count: 2,
      raw_detail: {
        seed_data: {
          snapshot: {
            variants: [{ option_name: 'Size' }],
          },
        },
      },
    } satisfies ProductResponse & { variant_count: number }

    expect(resolveProductCardPresentation(product)).toEqual({
      title: 'Oat So Simple Water Cream',
      subtitle: null,
      highlight:
        'A lightweight moisturizer formulated with Oat Extract that effectively soothes and hydrates skin with less than 10 ingredients.',
      badge: '2 sizes',
    })
  })

  it('can keep category context while surfacing a compact benefit line for recommendation cards', () => {
    const product = {
      product_id: 'prod_5',
      title: 'Pore Refiner',
      description:
        'A clarifying treatment that helps smooth texture and visibly minimize the look of pores.',
      price: 30,
      currency: 'USD',
      in_stock: true,
      category: 'treatment serum',
      reason: 'same_brand_same_category',
    } satisfies ProductResponse & { reason: string }

    expect(
      resolveProductCardPresentation(product, {
        allowDescriptionAlongsideSubtitle: true,
        suppressGenericReasonBadges: true,
      }),
    ).toEqual({
      title: 'Pore Refiner',
      subtitle: 'Treatment Serum',
      highlight:
        'A clarifying treatment that helps smooth texture and visibly minimize the look of pores.',
      badge: null,
    })
  })
})
