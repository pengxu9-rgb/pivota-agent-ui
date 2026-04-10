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
})
