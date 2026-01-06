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

## Promotions console (internal)

- Route: `/ops/promotions` (internal-only console for configuring deals used by Creator Agents).
- Server-side proxy env vars (required):  
  - `MERCHANT_API_BASE_URL` – base URL of the gateway backend (e.g. https://pivota-agent-production.up.railway.app)  
  - `MERCHANT_ADMIN_KEY` – admin key injected via proxy headers (`X-ADMIN-KEY`)
- The browser never sees the admin key; all calls go through `/api/promotions`.

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Lucide Icons
