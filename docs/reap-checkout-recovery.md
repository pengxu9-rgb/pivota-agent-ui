# Reap checkout recovery and release gates

This change is based on main `408013de6d09adc03396fbc65e991099853fa204`. The item-id, seller-conflict, degraded-view and past-approval/cross-tab safeguards from merged PRs #385 and #387 remain in place.

## Recovery contract

Before dispatching create, the browser obtains the signed HttpOnly buyer cookie through same-origin `POST /api/reap-checkout/session`. The JSON response contains only an opaque equality marker (`scope`), which provides no authentication authority. Create requires the matching cookie and marker (`buyer_scope`); a lost, expired or rotated cookie cannot replay an old request under a fresh identity. Production-build and loopback guards remain unchanged.

The browser stores an idempotency key, SHA-256 digest of the validated normalized request, opaque owner scope, and resolution flag in localStorage. It stores no email, phone, name or address. Recovery requires re-entering the same normalized details; offer codes remain exactly as typed. The digest remains sensitive recovery metadata and must not be logged or exported with buyer data.

Web Locks serialize buyer bootstrap, attempts and reset across tabs. A browser without Web Locks or durable storage fails before upstream create. Closing a tab releases the lock while retaining the persisted attempt. A repeated unresolved attempt uses the distinct read-only `recover_checkout` gateway tool with its original key; it never retries `create_checkout` after idempotency TTL expiry. An older gateway rejects the unknown tool without a create, and no automatic fallback is attempted. Recovery uses the read quota so a create quota does not block reconciliation. Changed details remain blocked while its outcome is unknown. Unknown attempts never age into permission to create a new purchase.

A gateway timeout, malformed result, generic tool error or legacy non-Reap fallback keeps the attempt unresolved. The deployed gateway can fall through to storefront after a dispatched backend request times out, so a storefront result is not authoritative evidence of no Reap purchase. A deterministic refusal may release a *fresh* first attempt; a refusal/rate limit on replay cannot resolve an earlier unknown attempt. Recovery that returns the actual purchase saves its id before unlocking the attempt.

Checkout ids are retained across cookie expiry and 404s. A 404 can mean buyer/session or merchant scope changed, issuer removal or a disabled rail; it cannot prove an unpaid purchase. Reset is serialized and refuses any unresolved attempt or unsettled checkout across every product, preserving recovery on reset failures. Known completions, and terminal outcomes before any handoff, can be explicitly cleared by changing buyer. Cases after handoff that remain uncertain require support reconciliation.

## Hosted links and display

Handoff is refused if the browser cannot persist and read back the handoff recovery flag before opening the page. The hosted URL must pass the existing Reap domain allowlist. Its published deadline is checked during render, every second while visible, and again at click. Missing or malformed deadlines fail closed. The gateway's current pending-buyer contract publishes `expires_at` from a verified finite deadline; the UI does not invent a read-time expiry. The backend's optional-provider enrollment expiry needs a separately verified stable fallback tied to the originating enrollment row if the provider omits it.

Valid `poll_after_seconds` hints are honored (minimum three seconds). Error backoff never polls sooner than the last valid server hint. Focus/manual refresh still refreshes immediately by explicit interaction; this does not change worker polling cadence.

Enrollment shows the checkout's exact variant and quantity. Phone numbers require international E.164 shape; US/CA/AU destinations require recognized state/province codes and the supported countries' postcode shape is checked both before browser dispatch and before gateway create.

Set server-only `REAP_CHECKOUT_ENVIRONMENT=sandbox` or `live` only after verifying the proxy destination and rail configuration. An absent/invalid value displays an unconfirmed environment. A sandbox label does not prove simulation: sandbox completion copy does not claim a merchant receipt or shipment, and asks the operator to confirm whether the run was simulated. Actual simulation provenance is not supplied by the current gateway contract and remains a release check.

## Configuration and release gates

1. Review and merge backend authoritative reconciliation and gateway unknown-create behavior before staging acceptance. Test against current gateway as well as the patched gateway, since rollout may be staggered.
2. Do not replace the issuer key, rotate the buyer cookie or reset the session during an unresolved acceptance attempt. Keep the approved attempt's synthetic details in operator memory only; the browser intentionally does not persist them.
3. Run a clean sandbox rehearsal: create, lost-response recovery/replay, poll, hosted handoff, completed provider readback and ledger attribution/conversion deduplication. No simulated provider order id establishes real merchant fulfillment.
4. Publish the agreed purchase terms under a new immutable consent version and stable URL. `REAP_CHECKOUT_TERMS_URL` and `REAP_CHECKOUT_CONSENT_VERSION` remain configurable; this patch does not publish legal text or redefine earlier v1 consent.
5. Normal catalog `/api/gateway` uses a different server credential path from dedicated Reap checkout. Supply an intended staging catalog credential through `SHOP_GATEWAY_AGENT_API_KEY` or `AGENT_API_KEY`, restart the isolated process, and verify catalog requests. Do not blindly substitute `REAP_CHECKOUT_AGENT_API_KEY`. Keep `NEXT_PUBLIC_AGENT_API_KEY` unset for this flow: it takes precedence in the proxy and is also read by browser direct-API code. No runtime env or credential was changed in this patch.
6. Public production/demo flags remain off. No merge, release, issuer registration, partner provisioning, merchant proof crawl or payment is performed by this change.
