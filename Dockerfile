FROM node:26.13.0-alpine3.24 AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_VERSION=11.6.0
WORKDIR /app
RUN npm install -g npm@"${NPM_VERSION}"
# Create non-root user early for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Runtime dependencies only, copied into the final image
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Full dependency tree (including devDependencies), used to build the app
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build && \
    chmod +x entrypoint.sh

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Copy production dependencies
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy runtime dependencies with proper permissions
COPY --from=builder --chown=nextjs:nodejs /app/cron.js ./cron.js
COPY --from=builder --chown=nextjs:nodejs /app/email ./email
COPY --from=builder --chown=nextjs:nodejs /app/utils ./utils
COPY --from=builder --chown=nextjs:nodejs /app/database ./database
COPY --from=builder --chown=nextjs:nodejs /app/.sequelizerc ./.sequelizerc
COPY --from=builder --chown=nextjs:nodejs /app/entrypoint.sh ./entrypoint.sh

# Create data directory with proper permissions
RUN mkdir -p /app/data && \
    chown -R nextjs:nodejs /app/data && \
    chmod 755 /app/data

USER nextjs
EXPOSE 3000

# Alpine ships busybox wget. /api/app/settings is an unauthenticated GET route that returns 200 when the app is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/api/app/settings" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
