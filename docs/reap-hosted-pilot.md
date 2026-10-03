# Hosted Reap sandbox pilot

The selected Reap checkout flow never offers another store or checkout rail. This policy replaces historical demo fallback descriptions. A gateway storefront result is an unknown outcome, not permission to buy elsewhere. Refusals stop the primary route; unresolved attempts retain their exact key, buyer and source for read-only recovery. The panel provides no alternate store links, including on failed/expired/refused terminal views.

The signed HttpOnly buyer cookie has an absolute four-hour lifetime. Successful create, recovery, validation and refusal activity cannot re-sign it. A newly minted buyer gets a cookie; an expired/lost/rotated original scope cannot replay an old attempt as a new buyer. Per-request five-minute JWTs do not extend cookie lifetime.

## Profiles

The default `demo` profile remains non-production and loopback only. Its existing two flags remain required. A production image cannot arm this profile.

A separate `pilot` profile defaults off. It requires all of:

* Build argument `NEXT_PUBLIC_REAP_CHECKOUT_DEMO=true` (the Docker default and automated main build remain false).
* `REAP_CHECKOUT_PROFILE=pilot` and `REAP_CHECKOUT_PILOT_ENABLED=1`.
* `REAP_CHECKOUT_PILOT_ORIGIN`: one exact owned HTTPS origin, such as a reviewed pilot subdomain of `pivota.cc`. No credentials, path, query, fragment, non-default port or loopback.
* `REAP_CHECKOUT_PILOT_GATEWAY_ORIGIN`: one exact owned HTTPS gateway origin. `REAP_CHECKOUT_GATEWAY_BASE_URL` must equal this pin; no alternate upstream or redirect is followed.
* Server-only `REAP_CHECKOUT_AGENT_API_KEY`, matching the backend's approved sandbox pilot agent.
* The existing `REAP_DEMO_USER_JWT_*` server settings: RSA private key at least 2048 bits, bounded ASCII kid/audience, and issuer exactly `<pilot origin>/reap-checkout`. Gateway and backend must trust the same issuer/audience/JWKS before activation.
* `REAP_CHECKOUT_PILOT_ROUTES`: a bounded JSON list naming explicit domain, market, initial source and exact UI product IDs. A malformed entry disables the entire profile.

Example shape only; replace every placeholder with reviewed real values:

```json
[{"domain":"reviewed-merchant.example","market":"US","item_source":"cart_link","product_ids":["reviewed-pdp-id"],"merchant_ids":["optional-reviewed-catalog-seller-id"]}]
```

Valid sources are `reap_variant` and `cart_link`; no wildcard source, product or implicit lane is permitted in pilot configuration. This UI scope is additional to the backend's mandatory agent/domain/market/product/variant/quantity/currency/maximum-total scope. It does not certify proof or enrollment provenance.

Requests must arrive at the pinned public HTTPS origin with its exact Host. State-changing requests additionally require the same Origin and `Sec-Fetch-Site: same-origin` when supplied. HTTPS uses Secure `__Host-` cookies; agent keys/private keys are never exposed to the browser. The public config exposes only the selected merchant, market, source and approved UI product IDs needed to show the entry.

New creates must match current configured source/product. The panel stores the original source with the opaque attempt metadata and digest, never buyer contact data. Recovery uses that saved original source even if new-create config later changes; backend owner/hash checks remain authoritative. Historical attempts lacking a source preserve their old fingerprint and use the legacy read-only recovery contract.

## Activation and verification

Shipping source does not activate this pilot. Before enabling its runtime flag, verify the chosen sandbox topology, database isolation/preflight, sandbox provider mode, exact issuer trust, current stored proof/eligibility and pilot scope, recipient/alert readiness, and enrollment provenance. Do not refresh proof clocks or bypass the existing merchant approval gate.

Deploy this initial pilot with a confirmed single serving instance. The existing per-buyer/global request caps are in-process; scaling across instances requires shared counters before widening. A main deployment's Docker image is built with the public entry off. An approved pilot build needs a distinct image identity built with the argument on; do not silently reuse a cached off image or alter an existing commit tag.

After deployment, check the serving image digest, source revision, traffic and pinned public host. Then run the chosen source's full sandbox route through session, one keyed create, enrollment/hosted handoff where approved, owner polling, terminal result and exact recovery. Fault cases must show zero alternate create requests, redirects or store links. Provider simulation is labeled as such and cannot establish a real merchant order.

Current main's selected-variant carrier is retained alongside the explicitly
configured primary `item_source`. The first create carries both when applicable;
read-only recovery retains the original selector, source and key. A legacy
pending request without a selector is recovered without adding today's selector.
Catalog or variant refusals stop this selected checkout and offer no alternate
spending link. Only an authoritative pre-dispatch refusal may clear a fresh
attempt; every recovery tool error leaves the original attempt unresolved.
