# Pivota Shopping AI

A beautiful, modern shopping assistant interface powered by AI.

## Features

- 🤖 AI-powered chat interface
- 🛍️ Product search and display
- 💳 Shopping cart management
- 📦 Order tracking
- 🎨 Beautiful gradient UI with Tailwind CSS

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Deployment

This app is deployed on Vercel at [https://agent.pivota.cc](https://agent.pivota.cc)

## Change guardrail (must read)

- The Agent frontend PDP and checkout flows are frozen by default.
- Do not change PDP/checkout logic, UI, routing, or API wiring unless there is an explicit update instruction from the owner.
- Protected scope includes:
  - `src/features/pdp/**`
  - `src/app/products/**`
  - `src/app/order/**`
  - `src/app/api/checkout/**`
  - `src/app/api/ucp/checkout-sessions/**`

## Promotions console (internal)

- Route: `/ops/promotions` (internal-only console for configuring deals used by Creator Agents).
- Server-side proxy env vars (required):  
  - `MERCHANT_API_BASE_URL` – base URL of the gateway backend (e.g. https://pivota-agent-production.up.railway.app)  
  - `MERCHANT_ADMIN_KEY` – admin key injected via proxy headers (`X-ADMIN-KEY`)
- The browser never sees the admin key; all calls go through `/api/promotions`.

## Checkout direct invoke (Phase 2)

- `NEXT_PUBLIC_ENABLE_DIRECT_CHECKOUT_INVOKE`  
  `true` = browser checkout ops (`preview_quote/create_order/submit_payment`) try direct invoke first with `X-Checkout-Token`, then auto-fallback to `/api/gateway` on CORS/network/401/403.
- `NEXT_PUBLIC_DIRECT_CHECKOUT_INVOKE_URL`  
  Direct invoke URL (default: `https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke`).

## Aurora orders merchant scope (embed only)

- `NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID`  
  Fallback merchant scope for orders list filtering when `entry=aurora_chatbox` and URL does not include `merchant_id`.
- This variable is only used in Aurora embed flow; non-Aurora orders pages keep existing behavior.

Example:

```bash
NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID=merchant_aurora_default
```

## Orders page performance (optional)

- `NEXT_PUBLIC_ORDERS_LIST_TIMEOUT_MS`  
  Timeout (ms) for the initial `/orders/list` request on orders page. Default: `3500`.
- `NEXT_PUBLIC_ORDERS_RECOVERY_RETRY_TIMEOUT_MS`  
  Timeout (ms) for the single retry after Aurora session recovery. Default: `3500`.
- `NEXT_PUBLIC_ORDERS_RECOVERY_BOOTSTRAP_TIMEOUT_MS`  
  Timeout (ms) for Aurora bootstrap (`postMessage` auth bootstrap) during orders recovery. Default: `1800`.
- `NEXT_PUBLIC_ORDERS_UNSCOPED_PRIME_LIMIT`  
  Temporary list size used only when Aurora scope is missing, to quickly resolve scope before a scoped refresh. Default: `6`.

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Lucide Icons
