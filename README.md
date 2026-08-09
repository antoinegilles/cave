# 🍷 Cave

Cave à vin virtuelle auto-hébergée. Chaque bouteille est rangée à un **emplacement numéroté**
qui correspond à celui inscrit physiquement sur le casier — et quand on cherche un vin pour un
repas, **les emplacements correspondants s'allument** dans le plan du casier.

Construit pour remplacer la fonctionnalité « cave » de Vivino, devenue payante.

---

## Ce que ça fait

**Ranger une bouteille** — On photographie l'étiquette, les informations se remplissent
seules (domaine, cuvée, millésime, appellation, note Vivino, cépages, accords mets-vins,
profil gustatif). On corrige si besoin, on saisit le numéro d'emplacement, c'est rangé.

Deux autres voies si la photo échoue : **code-barres** de la contre-étiquette, ou **recherche
par nom**. Et toujours la saisie manuelle. Aucune voie n'est bloquante.

**Retrouver une bouteille** — On tape `poisson`, `agneau`, `huitres`, une région, un domaine.
Les emplacements correspondants s'illuminent dans le casier, les autres s'estompent. On lit le
numéro, on va chercher la bouteille. Filtres complémentaires : couleur, note Vivino minimale,
profil marqué (tannique, acide, sucré, intense).

**Sommelier IA** *(optionnel, feature-flippé)* — Une question en langage naturel
(« gigot d'agneau aux herbes pour six »), l'IA choisit parmi les vins **réellement en cave** et
allume leurs emplacements. Limité à 3 requêtes par jour et par personne.

**Après la dégustation** — L'emplacement se libère, la bouteille rejoint l'historique avec la
date, une note personnelle et un commentaire. La page « à ouvrir bientôt » signale les vins
dont la fenêtre de dégustation se referme.

---

## D'où viennent les données

| Source | Rôle | Coût |
|---|---|---|
| **Vivino** | Note, accords mets-vins, cépages, profil, région, prix moyen, visuel | Gratuit |
| **Gemini** (Google AI Studio) | Lecture de l'étiquette (vision) + sommelier | Free tier, sans CB |
| **Open Food Facts** | Résolution par code-barres EAN | Gratuit, API ouverte |
| **Heuristiques embarquées** | Accords et profil déduits du cépage/région/couleur | Hors-ligne |

### Sur le scraping Vivino

Vivino n'expose plus d'API publique et ses CGU interdisent le scraping. L'application
récupère une fiche **une seule fois par vin**, la met en cache définitivement en base, et
espace ses requêtes de 2 secondes. En usage familial, cela représente une poignée de requêtes
par mois.

Le risque concret est un blocage IP, pas un problème juridique. C'est pourquoi un
**coupe-circuit** est prévu : après 3 échecs consécutifs, le provider est désactivé une heure
et les fiches sont établies depuis l'étiquette puis enrichies par les heuristiques embarquées
(cépage → accords, région → profil). **L'application reste pleinement utilisable sans Vivino.**

`VIVINO_ENABLED=false` coupe complètement cette source.

### Sur l'IA

Trois garde-fous, tous adossés à la base pour survivre à un redémarrage :

1. **Feature flag** en base, pilotable depuis la page Admin. Coupé, l'endpoint répond 404.
2. **Quota** de 3 requêtes/jour/utilisateur. Un appel en échec n'est pas décompté.
3. **Contexte plafonné** : une ligne compacte par vin, 60 vins maximum, soit ~1 000 tokens
   en entrée et 400 en sortie. C'est ce qui garde l'usage dans le free tier Gemini.

La recherche web externe est **désactivée par défaut** (`AI_ENABLE_GROUNDING=false`) : les
données Vivino sont déjà en base, la relancer coûterait en latence et en tokens pour un gain
marginal.

Sans `GEMINI_API_KEY`, l'app fonctionne toujours : saisie manuelle, recherche par nom et
recherche classique. Seuls le scan photo et le sommelier sont indisponibles.

---

## Démarrage local

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed        # crée l'admin (mot de passe affiché une fois) + un casier 6×10

npm run dev            # API sur :3000, front sur :5173
```

## Déploiement sur VPS

L'application tient dans **une seule image Docker** : Fastify sert l'API et le SPA compilé.
Elle publie son port sur la **loopback uniquement** — le Caddy partagé du VPS fait le TLS.

```bash
# Sur le serveur
mkdir -p /srv/cave && cd /srv/cave
curl -O https://raw.githubusercontent.com/antoinegilles/cave/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/antoinegilles/cave/main/backup.sh && chmod +x backup.sh
curl -o .env https://raw.githubusercontent.com/antoinegilles/cave/main/.env.example

# Renseigner .env — a minima JWT_SECRET
openssl rand -hex 32     # → JWT_SECRET

docker compose up -d
docker compose logs cave  # le mot de passe admin s'affiche une seule fois
```

Puis dans le **Caddyfile partagé** (voir `Caddyfile.snippet`) :

```
cave.tondomaine.fr {
	reverse_proxy cave:3000
}
```

Le Caddy du VPS tourne lui-même dans un conteneur : depuis chez lui, `127.0.0.1` désigne
Caddy et non l'hôte. Cave rejoint donc son réseau (`CADDY_NETWORK` dans `.env`) pour être
joignable par son nom de service. Le port loopback ne sert plus qu'au diagnostic — s'il
entre en conflit avec un autre projet du VPS, change `APP_PORT`.

### Déploiement automatique

Un push sur `main` déclenche : typecheck → tests → build de l'image → publication sur GHCR →
SSH sur le VPS → `docker compose pull && up -d`, avec attente du healthcheck et sauvegarde
préalable de la base.

Secrets à définir dans le dépôt GitHub :

| Secret | Rôle |
|---|---|
| `SSH_HOST` | Adresse du VPS |
| `SSH_USER` | Utilisateur SSH |
| `SSH_KEY` | Clé privée SSH |
| `SSH_PORT` | Port SSH (optionnel, 22 par défaut) |
| `DEPLOY_PATH` | Chemin du `docker-compose.yml` sur le serveur |

### Sauvegarde

```bash
./backup.sh                              # ponctuelle
0 3 * * * cd /srv/cave && ./backup.sh    # quotidienne, 7 jours conservés
```

`sqlite3 .backup` plutôt qu'un `cp` : en mode WAL, une copie brute peut capturer une base
incohérente. Restauration : décompresser et remplacer `data/cave.db`, conteneur arrêté.

---

## Architecture

```
apps/server    Fastify + Prisma (SQLite) + Zod
  providers/   Vivino (scraping + parsers), Open Food Facts, heuristiques, chaîne + coupe-circuit
  services/    Gemini, lecture d'étiquette, sommelier, recherche, persistance
  routes/      auth, racks, bottles, wines, ai, stats, admin
apps/web       Vue 3 + Vite + Pinia + Tailwind v4 + PWA
  RackGrid.vue     le plan de casier SVG — le cœur du produit
  SearchPanel.vue  recherche classique et sommelier, même mécanisme d'allumage
packages/shared  types, schémas Zod, référentiel d'accords mets-vins
```

**SQLite** parce qu'une cave familiale tient en quelques centaines de lignes : un fichier
unique, une sauvegarde triviale, aucun conteneur de base à opérer.

**Le référentiel d'accords** (`packages/shared/src/food.ts`) rabat les libellés hétérogènes des
providers — `Rich fish`, `Poisson gras (saumon, thon, etc.)` — sur des slugs canoniques. C'est
ce qui permet de chercher « saumon » en SQL et de trouver un vin dont Vivino disait
`Rich fish`.

---

## Tests

```bash
npm test
```

Les parsers Vivino sont testés sur des **captures HTML réelles** du site (`__fixtures__/`),
en version française et anglaise. Si Vivino change son markup, la CI casse — et on l'apprend
avant que l'ajout de bouteille ne se dégrade silencieusement en production.

Sont également couverts : la numérotation des emplacements (par rangée / par colonne, numéro
de départ personnalisé), la déduplication des vins, et les heuristiques d'accords.
