# syntax=docker/dockerfile:1.7

# Image unique : Fastify sert l'API et le SPA compilé.
# C'est ce qui rend le branchement derrière un Caddy partagé trivial — un seul
# reverse_proxy, pas de CORS, pas de second conteneur à orchestrer.

# ---------------------------------------------------------------- dépendances
FROM node:22-alpine AS deps
WORKDIR /build

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

# Le postinstall de Prisma télécharge ses moteurs : c'est le point le plus fragile du
# build. Sans ces réessais, un ECONNRESET passager fait échouer un déploiement au hasard.
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000

# --------------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /build

# npm workspaces hoiste tout à la racine ; `node_modules/@cave/shared` est un lien
# symbolique relatif vers `packages/shared`, qui reste valide dans l'image finale.
COPY --from=deps /build/node_modules ./node_modules
COPY . .

# Prisma a besoin d'une URL au moment du generate, même sans base joignable.
ENV DATABASE_URL="file:/tmp/build.db"

RUN npm run build --workspace=@cave/shared \
 && npm run build --workspace=@cave/server \
 && npm run build --workspace=@cave/web

# Ne conserve que les dépendances de production pour l'image finale, puis regénère le
# client Prisma : `prune` réorganise node_modules et peut emporter le client généré.
RUN npm prune --omit=dev \
 && npx prisma generate --schema apps/server/prisma/schema.prisma

# ------------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
WORKDIR /app

# `dumb-init` fait office de PID 1 : sans lui, SIGTERM n'atteint pas Node et
# `docker compose down` attend 10 s avant de tuer le conteneur à chaque déploiement.
RUN apk add --no-cache dumb-init sqlite \
 && addgroup -g 1001 cave \
 && adduser -u 1001 -G cave -s /bin/sh -D cave

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data \
    DATABASE_URL="file:/app/data/cave.db" \
    STATIC_DIR=/app/public

COPY --from=build --chown=cave:cave /build/node_modules ./node_modules
COPY --from=build --chown=cave:cave /build/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=cave:cave /build/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=cave:cave /build/apps/server/dist ./dist
COPY --from=build --chown=cave:cave /build/apps/server/package.json ./
COPY --from=build --chown=cave:cave /build/apps/server/prisma ./prisma
COPY --from=build --chown=cave:cave /build/apps/web/dist ./public
COPY --chown=cave:cave docker/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && mkdir -p /app/data && chown cave:cave /app/data

USER cave
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["./entrypoint.sh"]
