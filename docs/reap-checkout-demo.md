# Reap checkout demo: runbook

This runbook is for demoing "Buy with Reap" to partners. It covers the Tier B (cart-link) lane for
**judydoll.com (US)** and **jsmbeauty.sg (SG)**, run against **staging**. Never run it against prod.

> ## ⛔ STOP BEFORE APPROVING
> Reap has **not yet confirmed** whether approving a **sandbox** checkout places a **real order** at the
> merchant's store. The cart-link lane sends Reap a real Shopify cart permalink on the merchant's live store.
> Until Reap confirms in writing, run the demo **up to the "Continue to secure payment" page** (screens 1–6)
> and **do not click Approve on Reap's page**. Show screens 7 and 8 (placing order, order placed) from the
> screenshots or the local mock (§7), not live.

## 0. What the partner sees, and what never happens

| # | Screen | Shot |
|---|---|---|
| 1 | The PDP for a links-out merchant. **"Buy with Reap"** is the primary (filled) button in the purchase bar, to the right of a secondary outlined store button. Below 560 px the store button reads "Visit store" with no price; the Reap price always shows. | `reap-checkout-demo/01-pdp-buy-with-reap.jpg` (390 px), `01b-pdp-buy-with-reap-375.jpg` (375 px) |
| 2 | A sheet asks for shipping details, an optional **offer code** and a terms checkbox. There is no card field. | `02-form.jpg`, `03-form-filled-offer-code.jpg` |
| 3 | "Confirming the item and getting your total from the merchant…" takes about 30–45 s. The offer code shows as sent. | `04-preparing-quote.jpg` |
| 4 | **The quote.** The checkout's own rows: Items, Shipping, Tax (or "Tax included in prices"), **Discount (negative)** and Total. It says "Offer code applied" or "Code not applied". | `05-awaiting-approval-quote.jpg`, `14-awaiting-tax-included-sgd.jpg` |
| 5 | **"Continue to secure payment"** opens Reap's own page in a **new tab**. Beside it: "Reap … handles your card on its own secure page. Pivota never sees or stores your card details". It also shows the **approval deadline**, about 5 minutes from the quote. | `06-awaiting-approval-handoff.jpg` |
| 5b | First-time buyer: Reap asks for a card first ("Add a card on Reap's secure page"). | `09-needs-card.jpg` |
| 6 | The buyer approves on Reap. The return page says to go back to the assistant, and the PDP tab refreshes by itself on focus. | — |
| 7 | "Approved. Reap is placing your order…" | `07-processing.jpg` |
| 8 | **"Order placed"** with the merchant order reference. | `08-completed-order-reference.jpg` |
| — | Other endings are failed (quote window lapsed), expired, refused (priced wrong) and approval window closed. Each has "Start a new checkout" and "Visit store". | `10`–`13` |
| — | If the Reap lane declines (not eligible, gate declined, backend refused), the sheet says "Checkout through Reap isn't available…", notes "Code not applied" if a code was sent, and offers **Visit store**. | `16-not-reap-visit-store.jpg` |
| — | If a payment link is not Reap's, the button is refused and never opened. | `15-link-not-reap-refused.jpg` |

**Guarantees built into the code:**
- The UI never collects card data. It never embeds, iframes or proxies Reap's page.
- A link is opened only if it is `https` on `reap.global` or `prava.space` (exact host or dot-suffix), with no userinfo and the default port. That is the same allowlist the gateway lane and the backend vouch for. `pay.prava.space` is where the backend fixtures show Reap's hosted pages.
- No price or discount is computed in the UI. The rows are the gateway's own, which come from Reap's `finalAmount` breakdown.
- The offer code goes to the backend exactly as typed.

## 1. How the pieces connect (staging)

```
browser ──► UI (npm run dev -- -H 127.0.0.1 on your laptop, :3000)
              /api/reap-checkout  (server-only env: agent key + demo buyer-token issuer)
              │  JSON-RPC tools/call create_checkout / get_checkout
              ▼
            staging gateway  POST /ucp/mcp   (via `gcloud run services proxy`, localhost:8081)
              │  Reap lane (REAP_AGENTIC_LANE_ENABLED) → POST/GET /agent/v2/commerce/reap/purchases
              ▼
            staging backend web  ──►  Reap SANDBOX       staging worker (poller) ──► Reap SANDBOX
```

**Why `/ucp/mcp` and not `/ucp/v1/checkout-sessions`?** The gateway has no REST binding of the UCP
checkout tools. `/ucp/v1/*` is not routed anywhere in PIVOTA-Agent `src/server.js`, and prod answers
`Cannot GET /ucp/v1/...` (checked 2026-09-29, gateway-00470-rud). The UI therefore calls the same MCP
door every buyer agent uses. **No gateway change is needed.**

**Why the UI mints a user token:** the Reap lane and the backend rail need two credentials, the agent API
key and an `X-Agent-User-JWT` naming the buyer. Without the token the lane skips silently and the buyer
gets the storefront answer. The UI has no buyer identity the gateway can verify, so for the demo its
server signs a short-lived RS256 token:
- `sub`/`sid` is a random id kept in a signed, HttpOnly, session-length cookie, so polls come from the same buyer. Only ids the UI server issued are accepted.
- There is no PII in the token.

**The seller is checked on the gateway's answer.** The UI sends the PDP's `sig_` id, and the gateway buys
the row that id resolves to, which can belong to a different seller than the offer the PDP showed. The UI
server reads the seller from the Reap checkout id that the lane returns: the product key
`prod::<merchant>::…` sits inside the id's snapshot. If that is not the demo merchant's configured id
(§3g), the UI server refuses and shows nothing to pay. "Sold and shipped by" comes from that check, not
from the page.

**The server refuses to arm outside a safe setup.** Every `/api/reap-checkout` route answers 404 unless
both flags are on and one of these holds:
- The gateway base is **loopback** (the `gcloud run services proxy`) and `NODE_ENV` is not `production`. `next dev` qualifies; a `next build` never does.
- `REAP_CHECKOUT_STAGING_GATEWAY_HOST` is set. It must name an https host with a `staging` label (e.g. `gateway.staging.pivota.cc`), that is never a production host, and the base must be exactly that host.

A production gateway can never be armed.

The staging gateway and staging backend are configured to trust that key (step 3).

**Where the UI runs:** on your laptop. agent-ui has no staging deployment. **Merging deploys it to prod**,
where both flags stay unset, so the PDP is unchanged there.

## 2. Pre-flight (read-only checks; do these first)

1. **MANDATORY: confirm staging has its own database. STOP if it doesn't.**
   On 2026-09-29 the coordinator verified separately that staging does **not** share prod's database:
   - pivota-prod: Cloud SQL `pivota-pg` at 10.25.0.2.
   - pivota-staging: its own `pivota-pg` at 10.122.0.3 (db-custom-1-3840), with a different database name.
   - Staging `web` and `worker` read their own project's `DATABASE_URL` secret.

   The backend comments that say the two share one DB are stale (`services/audit_scheduler.py` ~L311-331,
   `docs/runbooks/reap_agentic_purchase.md:304-306`). Re-check it anyway before each demo, because
   secrets can be rotated or copied. The commands below compare **host and database name only** and never
   print credentials:
   ```bash
   host_db() {   # prints "<host> <database>" for the latest DATABASE_URL secret of project $1
     gcloud secrets versions access latest --secret=DATABASE_URL --project "$1" \
       | python3 -c 'import sys,urllib.parse as u; p=u.urlsplit(sys.stdin.read().strip()); print(p.hostname, p.path.lstrip("/"))'
   }
   echo "prod:    $(host_db pivota-prod)"
   echo "staging: $(host_db pivota-staging)"
   ```
   Use the secret name each service actually mounts; check with `gcloud run services describe web --project pivota-staging --format='value(spec.template.spec.containers[0].env)'`, which shows secret *references*, not values.
   **If the host or the database name match, STOP. Do not arm anything.**
2. **Code on staging.**
   - Backend `web` and `worker` must carry pivota-backend #2425, #2431 and #2258 (merchant-domain canonicalisation).
   - The gateway must carry PIVOTA-Agent #2323 and #2324.
   - Deploy with `infra/gcp/deploy_backend.sh staging <sha>` and `infra/gcp/deploy_gateway.sh staging <sha>` (the gateway goes through the PR controller per the usual rule).
3. **Tier B verdicts.** The cart-link lane refuses without a **fresh ELIGIBLE** `tierb_cart_link_eligibility` row for `(judydoll.com, US)` and `(jsmbeauty.sg, SG)`. See pivota-backend `docs/runbooks/tierb_cart_link_eligibility.md` for how to read and refresh them (the job is `python -m jobs.tierb_cart_link_eligibility`).
4. **Pick demo products the lane will enter.** The lane requires all of the following:
   - A **Shopify** catalog row (not an `external_seed` row).
   - At most one real variant.
   - A price.
   - A merchant domain.
   - For the cart-link lane, a numeric Shopify variant proven within 7 days.

   **Caution:** the Judydoll PDP checked while building this (`sig_6433c8107859a484fb72d14861e84690`, Silky Matte Lip Ink) is served from an **`external_seed`** row (`prod::external_seed::external_seed::ext_…`). The lane may skip it and answer the storefront (screen 16).

   Start from the products the Tier B job itself probes in `config/tierb_cart_link_merchants.json`:
   - judydoll.com `single-eyeshadow` (variant `50041364447509`)
   - jsmbeauty.sg `lip-pression-glowy-tint` (variant `51905273004353`)

   Find their `sig_` ids and run the check in PIVOTA-Agent `docs/reap-agentic-lane.md` §7 step 2b against the **staging** gateway. Pass means:
   - an https `external_redirect_url`
   - `purchase_route` is not `internal_checkout`
   - `product_key` is `prod::<merchant>::shopify::<id>`
   - `variants` ≤ 1
5. **Market for SG.** agent.pivota.cc's catalogue is the US market in USD. A jsmbeauty.sg PDP must be served, and priced in SGD, for the SG purchase to pass the backend's `row_currency_mismatch` check. Confirm the SG product's PDP opens on the UI before the demo.

## 3. Environment changes (staging only; you run all of these)

Nothing below was applied by the PR. **Never set any of this on `pivota-prod`.**

### 3a. Generate the demo buyer-token key (on your laptop)

```bash
cd ~/dev/pivota-agent-ui            # on the PR branch
node scripts/reap-demo-keygen.mjs    # defaults: --issuer https://reap-demo.staging.pivota.cc/issuer --audience pivota-reap-demo
```

- This writes the **private** key to `.env.development.local` with mode 600.
  - `next dev` loads that file by itself, so the key never goes into your shell environment.
  - The script refuses unless the name matches `.env*.local` and `git check-ignore` confirms git ignores the path.
  - The file is never printed.
- The default issuer is a demo-only name on a staging label, not a production host.
- It prints only public material: the JWKS, one object to append to the gateway's `IDENTITY_ISSUERS_JSON`, and three backend values.

### 3b. The Reap sandbox key: from your env file straight to Secret Manager (never pasted anywhere)

```bash
# Prints nothing. It reads the key from your file, strips surrounding quotes and CR/LF, fails on an empty
# match, and pipes the value straight to Secret Manager. It runs in a subshell, so the variable never
# outlives it.
(
  set -eu
  v=$(sed -n 's/^REAP_API_KEY=//p' ~/.config/pivota/reap_sandbox.env | head -n 1 \
        | tr -d '\r\n' | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
  [ -n "$v" ] || { echo 'REAP_API_KEY not found (or empty) in the env file; nothing sent' >&2; exit 1; }
  printf '%s' "$v" | gcloud secrets create reap-sandbox-api-key --project pivota-staging --data-file=-
  # next time: ... | gcloud secrets versions add reap-sandbox-api-key --project pivota-staging --data-file=-
)
```

Use the variable name your file actually has (the backend's e2e harness reads `REAP_API_KEY`). Do not
`cat` or `echo` it. The staging services' runtime service account needs `roles/secretmanager.secretAccessor` on it.

### 3c. Staging backend `web` (Cloud Run `web`, project `pivota-staging`, us-west1)

| var | value |
|---|---|
| `REAP_AGENTIC_ENABLED` | `1` |
| `REAP_AGENTIC_CART_LINK_ENABLED` | `1` |
| `REAP_API_BASE_URL` | `https://sandbox.api.reap.global` |
| `REAP_API_KEY` | secret `reap-sandbox-api-key:latest` (`--update-secrets`) |
| `AGENT_USER_JWKS_JSON` | the JWKS printed by 3a |
| `AGENT_USER_JWT_ISSUERS` | the issuer from 3a |
| `AGENT_USER_JWT_AUDIENCE` | the audience from 3a |

Before setting the three `AGENT_USER_JWT*` vars, check whether staging `web` already has a global
user-token issuer (`AGENT_USER_JWKS_URL`, `_JSON` or `_FILE`). If it does, **do not replace it**. Use the
federated route instead:
1. Register issuer = the 3a issuer, aud = the 3a audience, `jwksUri` = a public https URL serving the 3a JWKS, for the UI's staging agent in the developer portal.
2. The UI serves the JWKS at `/api/reap-checkout/jwks` when it runs on a public host.
3. Note that registering writes `agent_identity_issuers`. If the DB is shared, that is a prod-DB row scoped to that agent.

Optional, sandbox only: `REAP_AGENTIC_SIMULATE_CHECKOUT=COMPLETED` makes the sandbox complete an approved
checkout (about 70 s) instead of ending `FAILED`. **It does not answer the real-order question**, so the stop rule still applies.

### 3d. Staging backend `worker` (the poller)

`AUDIT_WORKER_ENABLED=true`, plus the same four `REAP_*` values as `web`:
- `REAP_AGENTIC_ENABLED=1`
- `REAP_AGENTIC_CART_LINK_ENABLED=1`
- `REAP_API_BASE_URL`
- `REAP_API_KEY` (secret)

The worker is deployed separately from `web`. Nothing leaves `resolving` without it.

> **⚠ `AUDIT_WORKER_ENABLED=true` starts EVERY scheduled job in `services/audit_scheduler.py` on the
> staging worker, not just the Reap poller.** `_add_job` registers all of them behind that one switch.
> There is no per-job allowlist: the only per-job controls are the individual flags listed below.

Before flipping it, check which of these are armed in **staging** (`gcloud run services describe worker
--project pivota-staging`, env names only). The jobs with external side effects are:

| job | external effect | per-job control |
|---|---|---|
| `daily_audit_check` (03:00 UTC) | crawls/audits due merchants' live stores | none |
| `audit_run_worker_tick`, `executor_run_worker_tick`, `verification_run_worker_tick` | run queued audits / executor agents / verifiers: merchant site fetches, LLM calls | none |
| `store_lifecycle_reconciliation` | probes connected stores' platform APIs (Shopify etc.) and **disconnects** stores it believes are gone | none |
| `catalog_import_drain_tick`, `catalog_sync_drain_tick` | Shopify catalog imports/syncs against merchants' stores | `CATALOG_IMPORT_DRAIN_ENABLED` / `CATALOG_SYNC_DRAIN_ENABLED` (**on by default**; `=false` stops them) |
| `catalog_onboard_queue_drain` | autonomous crawls + catalog writes | `CATALOG_ONBOARD_ENABLED` (off by default) |
| `external_conversion_poll` | polls merchants' Shopify orders | `EXTERNAL_CONVERSION_POLLER_ENABLED` (off by default) |
| `cafe24_reconciliation` | Cafe24 API reads | `CAFE24_RECONCILIATION_ENABLED` (off by default) |
| `merchant_order_sync_worker_tick` | **writes to merchants' order systems** (refund sync) for queued rows | none |
| `merchant_order_create_reconcile` | enqueues merchant-order creates (money path) | its own flag (see the job) |
| `payment_reconcile_tick` | PSP API calls; **auto-finalizes** payments | `PAYMENT_RECONCILE_SWEEP_ENABLED` (off by default) |
| `settlement_file_transfer` (monthly, day 10) | **Stripe Connect transfers**; the service gates real transfers to production unless a staging override env is set | the override (make sure it is unset) |
| `invoice_generation_monthly`, `partner_settlement_monthly` | invoicing / settlement | registered PAUSED |
| `agent_card_revocation_sweep` | revokes cards at the issuer | `AGENT_CARD_REVOCATION_SWEEP_ENABLED` (off by default) |
| `official_domain_liveness` | HTTP probes of merchant domains | `OFFICIAL_DOMAIN_LIVENESS_ENABLED` (off by default) |
| `audit_health_tick`, `audit_stability_canary`, `merchant_order_gap_alert`, `identity_reconcile_sweep` | alerts (and, for the last, catalog auto-apply) | `ENABLE_IDENTITY_RECONCILE_SWEEP` for the last |

Recommendation:
- Enable only what the demo needs. With no per-job allowlist, the practical options are:
  - Set the `*_ENABLED=false` kill switches above on the staging worker for the drains that default ON, and make sure the default-off flags stay unset.
  - Or skip `AUDIT_WORKER_ENABLED` and drive the poller by hand with `POST /admin/scheduler/jobs/reap_agentic_purchase_poll/run-now`. That only works if the job is registered, so this option depends on a small backend change.
- The smallest backend change is an optional `SCHEDULER_JOB_ALLOWLIST` env read in `_add_job` (register only the listed ids). With that, the staging worker could run `reap_agentic_purchase_poll` alone. It is out of scope here.

### 3e. Staging gateway (Cloud Run `gateway`, project `pivota-staging`)

| var | value |
|---|---|
| `AGENT_CHECKOUT_STRICT` | `1` (the `/ucp/mcp` door 404s without it) |
| `AGENT_CHECKOUT_UCP_TOOL_DOOR_ENABLED` | `1` |
| `REAP_AGENTIC_LANE_ENABLED` | `1` |
| `REAP_AGENTIC_CART_LINK_LANE_ENABLED` | `1`. This also arms offer codes. Without it, sending a code is refused `ucp_unknown_field` and the UI shows the error. |
| `IDENTITY_ISSUERS_JSON` | **append** the 3a object to the existing array; do not replace it |

Also check that the staging gateway's backend base (`PIVOTA_API_BASE`) points at **staging** `web`.

**Arming order** (PIVOTA-Agent `docs/reap-agentic-lane.md` §7):
1. Backend deployed.
2. Backend dials on.
3. Gateway `REAP_AGENTIC_CART_LINK_LANE_ENABLED` on last.

Roll back in reverse: gateway lane dials off first.

`MERCHANT_PURCHASABILITY_GATE_ENABLED` can stay as it is. If it is on and the backend is enforcing, a merchant with no fresh `purchase` fact for the market is **declined**. The lane then skips and the UI shows screen 16.

### 3f. A staging agent API key for the UI

Create an agent key for a demo agent on staging (developer or employee portal). It must look like `ak_live_<64 hex>`. The gateway reads it from `X-Agent-API-Key`. Put it only in your local `.env.local` (3g).

### 3g. The UI, locally (`.env.local` in the agent-ui checkout; never commit it)

```bash
NEXT_PUBLIC_REAP_CHECKOUT_DEMO=1
REAP_CHECKOUT_DEMO_ENABLED=1
REAP_CHECKOUT_GATEWAY_BASE_URL=http://localhost:8081      # the gcloud proxy below
REAP_CHECKOUT_AGENT_API_KEY=ak_live_…                      # from 3f; you paste it into the file yourself
REAP_CHECKOUT_DEMO_MERCHANTS=judydoll.com:US:<merchant id>,jsmbeauty.sg:SG:<merchant id>
# REAP_CHECKOUT_CONSENT_VERSION=reap-agentic-v1            # default
# REAP_CHECKOUT_STAGING_GATEWAY_HOST=                      # leave unset for a local demo (see below)
# The four REAP_DEMO_USER_JWT_* values are already in .env.development.local (3a). Next loads both files.
```

- **Merchant ids.** `<merchant id>` is the `<merchant>` segment of the product key that the step 2.4 check printed (`prod::<merchant>::shopify::<id>`). Use `id1|id2` if one domain has more than one. An entry without a merchant id is ignored, so no button shows for it: the UI never offers a purchase whose seller it cannot check.
- **Gateway base.** `REAP_CHECKOUT_GATEWAY_BASE_URL` must be loopback, which is the proxy. The staging gateway's run.app URL is IAM-gated anyway.
- **Staging override.** `REAP_CHECKOUT_STAGING_GATEWAY_HOST` is only for a deployed staging build of the UI that talks to a staging gateway on a `*.staging.*` host. Set it to exactly that host, and set the base to `https://<that host>`. It is never needed for this demo.

## 4. Run the demo

```bash
gcloud run services proxy gateway --project pivota-staging --region us-west1 --port 8081   # terminal 1
cd ~/dev/pivota-agent-ui
NODE_OPTIONS=--no-experimental-strip-types npm run dev -- -H 127.0.0.1                        # terminal 2
open "http://127.0.0.1:3000/products/<sig_ from step 2.4>"
```

**Why `-H 127.0.0.1`:** by default `next dev` listens on every interface. On a partner's or a
conference Wi-Fi, anyone on that network could then reach `/api/reap-checkout` and act as a buyer through
your staging agent key and demo issuer. Binding to loopback keeps the server reachable only from your
laptop. Open the page as `127.0.0.1`, not `localhost`, so the Origin/Host check matches exactly.

**Between partners on a shared laptop, clear the buyer.** The buyer is a session cookie plus the open
checkout's id in the browser's storage. Use a **fresh private/incognito window per partner** and close it
afterwards. Closing it clears both. In a normal window, clear site data for `127.0.0.1:3000` instead.

`NODE_OPTIONS=--no-experimental-strip-types` works around Node 24 loading `tailwind.config.ts` natively
(`require is not defined`). This affects `main` too and is not caused by this change.

The PDP itself still reads the catalogue from `SHOP_UPSTREAM_API_URL` (prod gateway by default). That is
read-only and fine. Only `/api/reap-checkout` goes to staging.

Walk the partner through screens 1–5. Give the details of a test buyer. With **PEACHIE20** on judydoll,
screen 4 shows a negative Discount row and "Offer code applied". Any other code shows "Code not applied".
**Stop at screen 5** (see the top).

## 5. Rehearse with no secrets (local mock)

```bash
node scripts/reap-mock-gateway.mjs      # 127.0.0.1:8787, answers the lane's own checkout objects
# .env.local: REAP_CHECKOUT_GATEWAY_BASE_URL=http://localhost:8787, a dummy ak_live_ key of 64 hex,
# REAP_CHECKOUT_DEMO_MERCHANTS=judydoll.com:US:merch_judydoll_demo (the mock's fixture seller),
# and a key from `node scripts/reap-demo-keygen.mjs` (writes .env.development.local)
curl 'http://127.0.0.1:8787/__mock/state?next=processing'   # "approved on Reap"
curl 'http://127.0.0.1:8787/__mock/state?next=completed'
```

The screenshots in `docs/reap-checkout-demo/` were captured this way.

## 6. Turning it off

- **UI:** unset `NEXT_PUBLIC_REAP_CHECKOUT_DEMO` or `REAP_CHECKOUT_DEMO_ENABLED`. Every `/api/reap-checkout` route then answers 404, and the PDP renders today's page with no extra request.
- **Gateway:** unset `REAP_AGENTIC_CART_LINK_LANE_ENABLED`, then `REAP_AGENTIC_LANE_ENABLED`. Then remove the demo issuer from `IDENTITY_ISSUERS_JSON`.
- **Backend:** unset `REAP_AGENTIC_ENABLED` on `web` and `worker`. Then remove the `AGENT_USER_JWT*` values if you added them.
- Purchases already open keep being swept by the backend.

## 7. Open risks

1. **Real orders from the sandbox.** Unconfirmed (see the top).
2. **Staging's database** (§2.1). Verified separate from prod on 2026-09-29. Re-check before every demo and stop if it matches prod. The worker switch starts every scheduled job, not just the Reap poller (§3d).
3. **Demo products may not enter the lane** (§2.4). This happens if the PDP row is `external_seed`, has several variants, or has no fresh Tier B verdict. The UI then shows "not available — Visit store", which is correct but not the demo.
4. **SG pricing** (§2.5). The storefront is US-only. An SG purchase needs an SGD-priced row served for SG.
5. **Approval window is about 5 minutes** from the quote, not the 15 the hosted page claims. After it lapses the purchase ends `failed / approval_window_lapsed`. The UI shows "Start a new checkout".
6. **The seller check reads the lane's checkout id.** The gateway documents that id as opaque. The UI decodes its versioned snapshot (`v:1`) to find the product key the purchase was opened for, and fails closed if it doesn't decode. The durable fix is a small gateway change:
   - publish the seller on the Reap checkout (e.g. a `reap.merchant_domain` message);
   - accept the seller the buyer was shown on create, so the lane skips a mismatch before it opens a purchase.

   On a mismatch today, a purchase is opened, never shown, and expired by the backend sweep. Nothing is charged.
7. **Demo scope is an env list.** `REAP_CHECKOUT_DEMO_MERCHANTS` only decides where the button shows. Eligibility is still the gateway's and backend's.
8. **The demo buyer-token issuer is a demo trust anchor.** Anyone holding its private key can mint staging buyer tokens for any `sub`. Keep it on your laptop, never configure it on prod, and remove it after the demo.
