# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# App Router projects may omit public/; standalone + runner COPY expect it to exist.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
# Build must not need a real DB; routes are force-dynamic + lazy DB load.
ENV JWT_SECRET="build-time-jwt-secret-min-32-chars-placeholder"
# Client WS URL is baked at build time — override on deploy, e.g.:
# fly deploy --build-arg NEXT_PUBLIC_SYNC_URL=wss://your-sync.fly.dev
ARG NEXT_PUBLIC_SYNC_URL=wss://localhost.invalid
ENV NEXT_PUBLIC_SYNC_URL=$NEXT_PUBLIC_SYNC_URL
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
