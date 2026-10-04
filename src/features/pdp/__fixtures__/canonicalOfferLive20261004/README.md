# Canonical offer route receipts

These are local, integrated gateway route outputs generated on 2026-10-04 from
captured public search/PDP identities and content. The route, current-own-money
gate, and builders are real; persistence is mocked. They are not production
responses or proof that these products are currently purchasable.

- The three `sig_*.json` receipts cover the live Full Cream, Missha mist, and Bee
  Pollen identities whose deployed current-own-money reads returned unavailable.
- `fullcream-verified-current-own-offer.json` is a positive protocol control with
  explicitly synthetic USD 19.95 current own money.
- `fullcream-verified-numeric-variant.json` is the positive control with selected
  variant `111`, Size `120g`, and the same synthetic USD 19.95 current own money.

The integration tests mount the actual PDP and server-render the actual page,
using the real adapter. Cache projection, pending/failed commerce verification,
read-only evidence, exact positive proof, seller/variant/money negative controls,
and independent Similar navigation are exercised without making purchases.

The current positive controls include a bounded `verified_at`/`expires_at` receipt from the actual local route. Its capture-time window intentionally expires. Tests which assert current purchase eligibility explicitly move only that verification instant in an isolated clone; raw receipt artifacts remain dated. `unknown-canonical-source.json` is an actual local route result for a deliberately unsupported synthetic producer. It is not a claim about production source distribution.
