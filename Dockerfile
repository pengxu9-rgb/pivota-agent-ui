# syntax=docker/dockerfile:1
# agent.pivota.cc (Next.js 15) on Cloud Run. Node 22 matches the Vercel project.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are inlined at BUILD time. UCP_WEB_BASE_URL and REVIEWS_BACKEND_URL are
# also needed here: next.config.mjs computes rewrite destinations from them during the
# build and bakes them into the routes manifest — setting them only at runtime is a no-op.
# The defaults ARE the production values (carried over from the Vercel project; none are
# secrets), so the deploy workflow and a hand-run `gcloud builds submit` build the same
# image from one place. Runtime-only env and secrets live on the Cloud Run service.
ARG NEXT_PUBLIC_ACCOUNTS_BASE=https://api.pivota.cc/accounts
ARG NEXT_PUBLIC_ADYEN_CLIENT_KEY=test_DC7Q2UCIO5H5NB6ZKIXWGNBKWUXPIAOI
ARG NEXT_PUBLIC_AGENT_DIRECT_READS_ENABLED=false
ARG NEXT_PUBLIC_API_URL=/api/gateway
ARG UCP_WEB_BASE_URL=https://ucp.pivota.cc
ARG REVIEWS_BACKEND_URL=https://api.pivota.cc
ENV NEXT_PUBLIC_ACCOUNTS_BASE=$NEXT_PUBLIC_ACCOUNTS_BASE \
    NEXT_PUBLIC_ADYEN_CLIENT_KEY=$NEXT_PUBLIC_ADYEN_CLIENT_KEY \
    NEXT_PUBLIC_AGENT_DIRECT_READS_ENABLED=$NEXT_PUBLIC_AGENT_DIRECT_READS_ENABLED \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    UCP_WEB_BASE_URL=$UCP_WEB_BASE_URL \
    REVIEWS_BACKEND_URL=$REVIEWS_BACKEND_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Vercel optimized /_next/image on its platform; self-hosted Next 15 needs sharp
# in-process (next@15.5.7 declares sharp ^0.34.3). AVIF encoding is CPU-heavy.
RUN npm install --omit=dev sharp@0.34.3 && npm cache clean --force
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# ISR pages and the data cache are written here per instance (Cloud Run fs = RAM).
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next
USER nextjs
ENV PORT=8080 HOSTNAME=0.0.0.0
EXPOSE 8080
CMD ["node", "server.js"]
