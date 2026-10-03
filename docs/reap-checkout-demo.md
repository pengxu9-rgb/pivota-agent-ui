> Current policy: [Hosted sandbox pilot](reap-hosted-pilot.md). The 2026-10-03 primary-route policy supersedes historical store fallback descriptions. The optional hosted profile defaults off; legacy demo remains loopback only.

# Reap checkout demo: runbook

This runbook is for demoing "Checkout with Reap" to partners from a laptop: the Tier B (cart-link) lane,
against a **non-production** gateway and backend. This repository is public, so the page is deliberately
generic. Environment-specific setup lives in the **operator notes**, which are kept outside git and never
committed:
- project, service and secret names;
- the trust setup for the demo's buyer-token issuer;
- the backend and gateway settings.

## ⛔ STOP rules. Read these first; each one ends the demo until it is resolved.

1. **Stop before approving.** Reap has **not yet confirmed** whether approving a sandbox checkout places a
   **real order** at the merchant's store. The cart-link lane sends Reap a real cart link on the merchant's
   live store.
   - Run the demo up to **"Continue to secure payment"** (screens 1–6), and **do not click Approve** on Reap's page.
   - Show screens 7 and 8 from the screenshots or the local mock (§6), not live.
2. **Do not turn on the backend's scheduled-job worker** in the demo environment. It starts every
   scheduled job, including payment reconciliation, merchant-order sync and store lifecycle jobs, not
   just the Reap poller.
   - Wait until the backend change that lets the worker run an allowlist of jobs is deployed there.
   - Then enable the worker only with an allowlist naming the Reap poller. The operator notes have the exact steps.
3. **Confirm the demo environment's payment-provider keys are test keys** before every demo. If you cannot
   confirm it, stop.
4. **Treat the demo environment's data as sensitive.** Don't browse, export or screenshot it.
5. **The demo environment must have its own database.** Do the check in the operator notes before every
   demo, and stop if it points at production's.

## 1. What the partner sees

| # | Screen | Shot |
|---|---|---|
| 1 | The product page of a links-out merchant. **"Checkout with Reap"** is the primary (filled) button in the purchase bar, to the right of a secondary outlined store button. The bar shows **no price or total**: nothing is known until the merchant quotes the buyer's address. Below 560 px the store button reads "Visit store", and below 440 px it shows its icon only. | `reap-checkout-demo/01-pdp-buy-with-reap.jpg` (390 px), `01b-pdp-buy-with-reap-375.jpg` (375 px) |
| 2 | A sheet shows the quantity chosen on the page, and asks for shipping details (postcode required), an optional **offer code** and the terms. The terms are a link plus the version tag that gets recorded. There is no card field. | `02-form.jpg`, `03-form-filled-offer-code.jpg` |
| 3 | "Getting your total from the merchant…" takes about 30–45 s. | `04-preparing-quote.jpg` |
| 4 | **The quote**, the **only place a total appears**. It shows the checkout's own rows: Items, Shipping, Tax (or "Tax included in prices"), **Discount (negative)** and Total, plus "Offer code applied" or "Code not applied". | `05-awaiting-approval-quote.jpg`, `14-awaiting-tax-included-sgd.jpg` |
| 5 | A prominent **"Approve within 5 minutes — by HH:MM"** banner. Reap's page may show a longer timer, but ours is the one that counts. Below it, **"Continue to secure payment"** opens Reap's own page in a **new tab**, with a note that Reap handles the card and Pivota never sees it. | `06-awaiting-approval-handoff.jpg` |
| 5b | First-time buyer: Reap asks for a card first. | `09-needs-card.jpg` |
| 6 | The buyer approves on Reap and comes back; the tab refreshes itself on focus. | — |
| 7 | "Approved. Reap is placing your order…" | `07-processing.jpg` |
| 8 | **"Order placed"** with the merchant order reference. | `08-completed-order-reference.jpg` |
| — | **Before the buyer is handed Reap's page**, every other ending (expired, refused, failed — e.g. the quote window lapsed, a dead card enrollment) says "nothing was charged" and offers "Start a new checkout". | `10`–`13` |
| — | **Once the buyer has clicked "Continue to secure payment"** (or approval was seen), ANY non-completed ending — including expired and "approval window lapsed", which the backend infers without asking Reap — says "We couldn't confirm your order. Check your email or card statement before trying again", with **no** retry; "Start as a new buyer" stays a secondary link under that check. | `17-failed-uncertain-no-retry.jpg` |
| — | The checkout disappeared (404): before a hand-off, "This checkout is no longer available"; after a hand-off, the same "couldn't confirm" answer, and the checkout is remembered. Never a live pay button. | — |
| — | Reap declined (not eligible, the purchasability gate declined, or the backend refused): "Checkout through Reap isn't available…" and **Visit store**. | `16-not-reap-visit-store.jpg` |
| — | The item would be sold by a different seller, or its seller can't be confirmed: "This item isn't available here from judydoll.com", and **only** "Visit judydoll.com" (built from our config). Nothing is opened or charged. | `18-seller-mismatch-visit-configured-merchant.jpg` |
| — | The payment link is not Reap's: it is refused and never opened. | `15-link-not-reap-refused.jpg` |

## 2. Guarantees and guards built into the code

- **Card data:** the UI never collects card data. It never embeds, iframes or proxies Reap's page.
- **Payment link:** a link is opened only if it is `https` on `reap.global` or `prava.space` (exact host or dot-suffix), with no userinfo and the default port. It opens in a new tab, `noopener,noreferrer`.
- **No UI arithmetic:** the UI computes no price, total or discount. The quote rows are the gateway's own, and the PDP quantity is sent in `create_checkout` so the merchant quote prices it.
- **Seller:** every create sends `checkout.reap.expected_merchant_domain`, the configured merchant, taken from server config and never from the browser. The gateway **refuses** any item that another seller would sell, or whose seller it cannot confirm, and opens nothing. The buyer is then offered only "Visit <that merchant>", built from our config, never a gateway link. On a Reap answer the server re-checks the published `reap.merchant_domain` (with `www.` folded), and it checks the quoted quantity. The checkout id is opaque and is not decoded. The panel shows a checkout as payable only when its echoed `line_items[0].item.id` is the product it asked for; otherwise the buyer gets the same mismatch copy. A degraded read (`reap.view_unavailable`) never carries a pay link.
- **Arming:** every `/api/reap-checkout` route returns 404 unless:
  - both flags are on;
  - it is **not a production build** (`next build`), which never arms, whatever the environment says;
  - the gateway base is **loopback**, i.e. a local proxy.
- **Request guards:**
  - Only loopback `Host` names are served, which blocks DNS rebinding.
  - A POST must come from the same origin.
  - Bodies are capped at 16 KiB.
  - Rate limits apply per buyer and globally, and count only requests that reach the gateway. `X-Forwarded-For` is never read.
- **The buyer:**
  - A server-minted, HMAC-signed, HttpOnly session cookie. It carries an issue time and is valid for at most 4 hours.
  - `__Host-` and `Secure` apply on https; plain-http loopback is the only exemption.
  - "Not you? Start as a new buyer" clears it.

## 3. UI configuration (this repo)

Set these in the UI checkout, in git-ignored files only:

| variable | value |
|---|---|
| `NEXT_PUBLIC_REAP_CHECKOUT_DEMO` | `1` (client) |
| `REAP_CHECKOUT_DEMO_ENABLED` | `1` (server) |
| `REAP_CHECKOUT_GATEWAY_BASE_URL` | `http://127.0.0.1:<proxy port>`, which must be loopback |
| `REAP_CHECKOUT_AGENT_API_KEY` | the demo agent's key (`ak_live_<64 hex>`); type it into the file yourself, never paste it anywhere else |
| `REAP_CHECKOUT_DEMO_MERCHANTS` | `domain:MARKET[:merchant_id][,…]` |
| `REAP_CHECKOUT_TERMS_URL`, `REAP_CHECKOUT_CONSENT_VERSION` | optional; defaults `https://pivota.cc/terms`, `reap-agentic-v1` |
| `REAP_DEMO_USER_JWT_*` | written by the keygen below |

- **Merchants:** the domain is the seller the buyer is shown. It is sent as `checkout.reap.expected_merchant_domain` and must equal the seller the gateway publishes. The optional `merchant_id` is the `<merchant>` segment of the catalog product key. When it is set and the gateway publishes a `reap.merchant_id`, the two must agree. A `reap.merchant_id` published as two different values, or malformed, is refused whether or not an id is configured. External-seed rows publish no merchant id, so leave it out for them.
- **Keygen:** `node scripts/reap-demo-keygen.mjs --issuer <issuer from the operator notes>` writes the four `REAP_DEMO_USER_JWT_*` lines to `.env.development.local`.
  - The file is mode 600, and `next dev` loads it, so nothing is sourced into your shell.
  - The script refuses any path git doesn't ignore.
  - `--force` replaces only its own lines.
  - It prints only public material, which the operator notes say where to register.

## 4. Run the demo

```bash
NODE_OPTIONS=--no-experimental-strip-types npm run dev:reap-demo    # = next dev -H 127.0.0.1
open "http://127.0.0.1:3000/products/<product id>"
```

- **Why `dev:reap-demo` (`-H 127.0.0.1`):** by default `next dev` listens on every interface. On a partner's or a conference
  Wi-Fi, anyone could then reach `/api/reap-checkout` and act as a buyer through your demo agent key.
  Binding to loopback keeps it reachable only from your laptop.
- **Why `NODE_OPTIONS`:** it works around Node 24 loading `tailwind.config.ts` natively. That affects `main` too.
- **Between partners on a shared laptop:** click **"Not you? Start as a new buyer"** in the sheet, **and** close
  **ALL** private/incognito windows before the next partner. Chrome shares one incognito session across
  all incognito windows, so closing one is not enough.

Walk the partner through screens 1–5.
- A test offer code shows a negative Discount row and "Offer code applied"; a wrong one shows "Code not applied".
- **Stop at screen 5.**

## 5. Turning it off (UI)

Unset `NEXT_PUBLIC_REAP_CHECKOUT_DEMO` or `REAP_CHECKOUT_DEMO_ENABLED`. Every `/api/reap-checkout` route
then answers 404, and the product page renders exactly as on `main` with no extra request. Backend and
gateway rollback: see the operator notes.

## 6. Rehearse with no secrets (local mock)

```bash
node scripts/reap-mock-gateway.mjs      # 127.0.0.1:8787, answers the gateway lane's own checkout objects
# .env.local: REAP_CHECKOUT_GATEWAY_BASE_URL=http://127.0.0.1:8787, a dummy ak_live_ key of 64 hex,
# REAP_CHECKOUT_DEMO_MERCHANTS=judydoll.com:US (the mock publishes judydoll.com as the seller),
# and `node scripts/reap-demo-keygen.mjs --issuer urn:example:reap-mock`
curl 'http://127.0.0.1:8787/__mock/state?next=processing'   # "approved on Reap"
curl 'http://127.0.0.1:8787/__mock/state?next=completed'
curl 'http://127.0.0.1:8787/__mock/scenario?create=seller_mismatch'   # the door refuses another seller
```

The screenshots in `docs/reap-checkout-demo/` were captured this way.

## 7. Open risks

1. **Real orders from the sandbox**: unconfirmed (STOP rule 1).
2. **The backend worker starts every scheduled job** (STOP rule 2).
3. **Demo products may not enter the lane.** This happens if the product row is an external-seed row, has several variants, or has no fresh Tier B verdict. The UI then shows "not available — Visit store".
4. **Approval window:** about 5 minutes from the quote, not the 15 that Reap's page shows. The banner says so.
5. **The seller contract must be live on the gateway.** Without it, the gateway rejects the `checkout.reap` member as an unknown field, and every create fails with the generic "could not be opened" copy.
6. **The demo buyer-token issuer is a trust anchor.** Keep its private key on your laptop only. Never register it on production, and remove it after the demo.
