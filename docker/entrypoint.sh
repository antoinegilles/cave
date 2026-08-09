#!/bin/sh
set -e

# Les migrations sont appliquées au démarrage : un déploiement se résume à un
# `docker compose pull && up -d`, sans étape manuelle sur le serveur.
echo "→ Application des migrations…"
npx prisma migrate deploy

# Amorçage d'une instance neuve : premier admin + casier de départ.
# Idempotent — sans effet si des comptes existent déjà.
echo "→ Vérification de l'amorçage…"
node dist/seed.js || true

echo "→ Démarrage de Cave"
exec node dist/index.js
