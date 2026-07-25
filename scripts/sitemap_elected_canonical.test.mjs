// LAYER 0 of the sitemap dedup: the backend's ELECTED canonical sig.
//
// #280 gave the sitemap one URL per content_key and made the choice sticky, so
// indexed URLs stopped churning. What it could not do is tell the PAGES. All
// 474 content_keys with more than one eligible sig serve identical content —
// same title, same Product JSON-LD, confirmed by 24 live fetches — under a
// SELF-referential <link rel="canonical"> each. Two URLs, same content, both
// claiming to be canonical: advertising the right one does not stop Google
// indexing the other.
//
// So the decision moved to the backend (migration 181, seeded once from this
// file's own answer) and BOTH surfaces read it: the sitemap advertises the
// elected sig, and get_pdp_v2 hands the same sig to every sibling PDP to emit
// as its canonical tag.
//
// That makes these tests an invariant check, not a preference check:
//
//     the sig this file advertises == the sig the gateway stamps
//
// If layer 0 ever loses to a lower layer, the sitemap submits URL A while A's
// own page points at B — which instructs the crawler to drop the URL we just
// submitted, strictly worse than the duplicate. Every "elected wins" assertion
// below is that failure mode, written from the side that can regress silently.

import { describe, expect, it } from 'vitest'
import {
  mergeDuplicateProduct,
  preferSitemapId,
  readCanonicalProduct,
} from './sitemap_lib.mjs'

// The measured P3 shape: a mirror sig that holds the index equity and a minted
// sig that wins the pure hex/lexicographic ordering. Chosen so the layers
// DISAGREE — a fixture where they happen to agree passes with the feature
// deleted.
const MIRROR_SIG = `sig_${'f'.repeat(32)}`
const MINTED_SIG = `sig_${'0'.repeat(32)}`
const SHARED_CK = 'ck_p3_pair'

function feedRow(sig, extra = {}) {
  return {
    sig_id: sig,
    content_key: SHARED_CK,
    serving_eligible: true,
    renderable: true,
    ...extra,
  }
}

describe('readCanonicalProduct — carrying the election through', () => {
  it('reads canonical_sig_id off the feed row', () => {
    const product = readCanonicalProduct(feedRow(MINTED_SIG, { canonical_sig_id: MIRROR_SIG }))
    expect(product.id).toBe(MINTED_SIG)
    expect(product.electedId).toBe(MIRROR_SIG)
  })

  it('treats a missing election as no election, not as an error', () => {
    // A backend that predates migration 181, or a content_key the sweep has
    // not reached. Layers 1-3 must still decide.
    expect(readCanonicalProduct(feedRow(MINTED_SIG)).electedId).toBe('')
    expect(readCanonicalProduct(feedRow(MINTED_SIG, { canonical_sig_id: null })).electedId).toBe('')
  })

  it('rejects a malformed election rather than advertising it', () => {
    // Same reasoning as the sig_id gate above it: a bare "sig_" or a ck_ id
    // resolves to a URL that 500s. An election is not a licence to skip that
    // check.
    expect(readCanonicalProduct(feedRow(MINTED_SIG, { canonical_sig_id: 'sig_' })).electedId).toBe('')
    expect(readCanonicalProduct(feedRow(MINTED_SIG, { canonical_sig_id: SHARED_CK })).electedId).toBe('')
  })
})

describe('preferSitemapId — layer 0 outranks every other layer', () => {
  it('THE INVARIANT: the election beats the incumbent', () => {
    // The only layer allowed to win over incumbency. If the backend has moved
    // a URL, the gateway is already stamping the new one — following it is how
    // the two stay in agreement, and refusing is how they diverge.
    expect(preferSitemapId(MIRROR_SIG, MINTED_SIG, new Set([MIRROR_SIG]), MINTED_SIG)).toBe(MINTED_SIG)
  })

  it('the election beats sig class and lexicographic order', () => {
    const legacy = `sig_${'b'.repeat(24)}`
    expect(preferSitemapId(legacy, MINTED_SIG, null, legacy)).toBe(legacy)
    expect(preferSitemapId(MIRROR_SIG, MINTED_SIG, null, MIRROR_SIG)).toBe(MIRROR_SIG)
  })

  it('wins from either argument position', () => {
    expect(preferSitemapId(MINTED_SIG, MIRROR_SIG, null, MIRROR_SIG)).toBe(MIRROR_SIG)
    expect(preferSitemapId(MIRROR_SIG, MINTED_SIG, null, MIRROR_SIG)).toBe(MIRROR_SIG)
  })

  it('an election naming a sig that is not a candidate cannot resurrect it', () => {
    // The elected sig lost the eligibility or renderable filter, which runs
    // BEFORE this dedup. Honouring it here would advertise a URL we have just
    // established does not render — #1583's dead-URL bug through a new door.
    const dropped = `sig_${'9'.repeat(32)}`
    expect(preferSitemapId(MIRROR_SIG, MINTED_SIG, new Set([MIRROR_SIG]), dropped)).toBe(MIRROR_SIG)
  })

  it('no election falls through to the #280 ordering, unchanged', () => {
    expect(preferSitemapId(MIRROR_SIG, MINTED_SIG, new Set([MIRROR_SIG]), '')).toBe(MIRROR_SIG)
    expect(preferSitemapId(MIRROR_SIG, MINTED_SIG, new Set([MIRROR_SIG]))).toBe(MIRROR_SIG)
    // ...and without incumbency, the pure layers still decide.
    expect(preferSitemapId(MIRROR_SIG, MINTED_SIG, null, '')).toBe(MINTED_SIG)
  })
})

describe('mergeDuplicateProduct — the election survives the fold', () => {
  it('applies the election when folding a duplicate pair', () => {
    const mirror = readCanonicalProduct(feedRow(MIRROR_SIG, { canonical_sig_id: MIRROR_SIG }))
    const minted = readCanonicalProduct(feedRow(MINTED_SIG, { canonical_sig_id: MIRROR_SIG }))
    expect(mergeDuplicateProduct(minted, mirror, null).id).toBe(MIRROR_SIG)
    expect(mergeDuplicateProduct(mirror, minted, null).id).toBe(MIRROR_SIG)
  })

  it('reads the election from whichever side carries it', () => {
    // Mid-rollout the two rows can disagree about whether they have seen an
    // election, and a fold that only looked at `existing` would drop it half
    // the time — a 50% failure that no single-ordering test would catch.
    const withElection = readCanonicalProduct(feedRow(MIRROR_SIG, { canonical_sig_id: MIRROR_SIG }))
    const without = readCanonicalProduct(feedRow(MINTED_SIG))
    expect(mergeDuplicateProduct(without, withElection, null).id).toBe(MIRROR_SIG)
    expect(mergeDuplicateProduct(withElection, without, null).id).toBe(MIRROR_SIG)
  })

  it('carries the election onto the merged row, so 3+ member groups converge', () => {
    // Prod has groups of 3 (25), 4 (22), 5 (1) and 7 (1). Folding is pairwise
    // and left to right; if the merged row lost electedId, every fold after the
    // first would silently drop back to the lexicographic layer.
    const rows = [
      readCanonicalProduct(feedRow(MINTED_SIG, { canonical_sig_id: MIRROR_SIG })),
      readCanonicalProduct(feedRow(`sig_${'1'.repeat(32)}`, { canonical_sig_id: MIRROR_SIG })),
      readCanonicalProduct(feedRow(MIRROR_SIG, { canonical_sig_id: MIRROR_SIG })),
      readCanonicalProduct(feedRow(`sig_${'2'.repeat(32)}`, { canonical_sig_id: MIRROR_SIG })),
    ]
    const folded = rows.reduce((acc, row) => (acc ? mergeDuplicateProduct(acc, row, null) : row))
    expect(folded.id).toBe(MIRROR_SIG)
    expect(folded.electedId).toBe(MIRROR_SIG)
  })

  it('keeps the newest lastmod, unchanged by layer 0', () => {
    const older = readCanonicalProduct(
      feedRow(MINTED_SIG, { canonical_sig_id: MIRROR_SIG, last_modified: '2026-05-01T00:00:00Z' }),
    )
    const newer = readCanonicalProduct(
      feedRow(MIRROR_SIG, { canonical_sig_id: MIRROR_SIG, last_modified: '2026-07-01T00:00:00Z' }),
    )
    expect(mergeDuplicateProduct(older, newer, null).lastmod).toBe(newer.lastmod)
  })
})
