# ---- base: Node + OpenSSL (Prisma needs it on Alpine) ----
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# ---- deps: all dependencies (incl. the Prisma CLI) + generated Prisma client ----
FROM base AS deps
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

# ---- dbsetup: one-off job that builds a LOCAL database (docker compose / CI only) ----
FROM deps AS dbsetup
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
COPY . .
CMD ["sh", "docker/db-setup.sh"]

# ---- runtime: production API image (default target) ----
FROM base AS runtime
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node . .
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
