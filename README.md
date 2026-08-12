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

## Promotions — Partner Preview (demo only)

- Route: `/ops/promotions` — a self-contained storyboard of AI-channel deals for
  partner conversations. The production promotions lane was deleted end-to-end
  (ADR-022 in pivota-backend); this page is the surviving demo of the target
  design: merchant authors an agent-exclusive deal → Pivota materializes it as
  a Shopify discount code → the agent presents the code → Shopify (the checkout
  authority) enforces it.
- All data lives in the visitor's browser (`localStorage` via
  `src/lib/promotionsDemoStore.ts`). No network calls, no env vars, nothing is
  written to any Pivota system. The former `MERCHANT_API_BASE_URL` /
  `MERCHANT_ADMIN_KEY` proxy env vars are dead and can be removed from Vercel.

## Aurora orders merchant scope (embed only)

- `NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID`  
  Fallback merchant scope for orders list filtering when `entry=aurora_chatbox` and URL does not include `merchant_id`.
- This variable is only used in Aurora embed flow; non-Aurora orders pages keep existing behavior.

Example:

```bash
NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID=merchant_aurora_default
```

## Skin Photo Upload Beta

- `NEXT_PUBLIC_SHOPPING_AGENT_PHOTO_UPLOAD_BETA`
  Enables the composer upload button for skin photo analysis. Default is on after the production photo contract canary passed. Set to `false`/`0`/`off` only as an emergency kill switch.
- The button is for face/skin photos only. Product bottles, PDP screenshots, and OCR/SKU guessing are not treated as supported success paths.
- Upload and analysis calls go through same-origin `/api/photo-analysis/*` routes so the browser never sees the agent key.

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

## Brand System

This app uses Pivota Brand Kit v2.0 from `public/pivota-brand/`. Treat `public/pivota-brand/CLAUDE.md` as the local source of truth for logo, favicon, color, and brand-token usage.
