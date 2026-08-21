# CLAUDE.md

Cave à vin virtuelle auto-hébergée pour usage familial. Chaque bouteille occupe un
**emplacement numéroté** qui correspond au casier physique ; quand on cherche un vin, les
emplacements correspondants **s'allument** dans le plan SVG du casier. Remplace la feu
fonctionnalité « cave » gratuite de Vivino.

Le `README.md` est la source de vérité produit (fonctionnalités, sources de données,
déploiement VPS, sauvegarde). Ce fichier couvre le travail sur le code.

## Stack & structure

Monorepo npm workspaces, ESM partout, TypeScript strict. Node ≥ 20.11.

```
apps/server      Fastify 5 + Prisma 6 (SQLite) + Zod + @fastify/jwt
  config.ts      env parsée par Zod — le serveur refuse de démarrer si invalide
  providers/     Vivino (scraping cheerio), Open Food Facts, heuristiques, chain + coupe-circuit
  services/      gemini, labelScan, sommelier, search, wines, serialize
  routes/        auth, racks, bottles, wines, ai, stats, admin
  lib/           prisma, password, dedupe, slots
  prisma/schema.prisma
apps/web         Vue 3 + Vite 6 + Pinia + Tailwind v4 + PWA
  components/RackGrid.vue    plan de casier SVG — le cœur du produit
  components/SearchPanel.vue recherche classique + sommelier, même mécanisme d'allumage
  stores/        auth, cellar, prefs
  views/         Cellar, AddBottle, Bottle, History, Stats, Admin, Login, Register
packages/shared  types, schémas Zod, référentiel d'accords mets-vins (food.ts)
```

Un seul conteneur Docker en prod : Fastify sert l'API **et** le SPA compilé, publié sur la
loopback ; le Caddy partagé du VPS fait le TLS.

## Commandes (depuis la racine)

```bash
npm install
npm run db:generate      # prisma generate
npm run db:migrate       # prisma migrate dev
npm run db:seed          # admin (mdp affiché une fois) + casier 6×10
npm run dev              # API :3000, front :5173

npm run build            # shared → server → web
npm run typecheck        # tous les workspaces
npm run lint             # eslint .
npm test                 # vitest sur tous les workspaces
```

Tests d'un seul workspace : `npm test --workspace=@cave/server`. Prisma Studio :
`npm run db:studio --workspace=@cave/server`.

## Conventions

- **Français** partout : commentaires, messages d'erreur, libellés UI, ce fichier.
- **Zod aux frontières** : env (`config.ts`), payloads de routes, schémas partagés dans
  `@cave/shared`. Ne pas faire confiance à une entrée non validée.
- **SQLite sans type JSON** : les champs `Json` du schéma sont du **TEXT sérialisé**
  (`grapes`, `structure`, `flavors` = strings JSON). Sérialiser/désérialiser explicitement —
  voir `services/serialize.ts`.
- **Catalogue dédupliqué** : `Wine` (le vin) vs `Bottle` (l'exemplaire physique). 6 bouteilles
  du même Bordeaux = 1 `Wine` + 6 `Bottle`. Clé de dédup : `dedupeKey = normalize(producer + name + vintage)`, voir `lib/dedupe.ts`.
- **`z.coerce.boolean()` est interdit** : `Boolean('false') === true`. Utiliser le helper
  `boolEnv` de `config.ts` pour toute variable booléenne d'environnement.
- **Style** : ESM, pas de point-virgule, `import type` pour les types.

## Invariants à ne pas casser

- **Aucune source externe n'est bloquante.** Sans `GEMINI_API_KEY` (scan/sommelier) ou avec
  `VIVINO_ENABLED=false`, l'app reste pleinement utilisable : saisie manuelle, recherche par
  nom, recherche classique. Les heuristiques embarquées (`providers/heuristics.ts`) prennent
  le relais pour accords/profil.
- **Coupe-circuit Vivino** : après 3 échecs consécutifs, provider désactivé 1 h. Cache
  permanent (`ScrapeCache`) : un vin n'est scrapé qu'une fois. Délai mini 2 s entre requêtes.
  Ne pas contourner ces garde-fous — le risque réel est le blocage IP.
- **Garde-fous IA**, tous adossés à la base pour survivre à un redémarrage :
  1. feature flag en base (table `FeatureFlag`, pilotable depuis Admin) — coupé → endpoint 404 ;
  2. quota 3/jour/utilisateur (compté via `AiQuery`, un échec n'est pas décompté) ;
  3. contexte plafonné (`AI_MAX_CONTEXT_WINES`, ~1 000 tokens in) pour tenir dans le free tier.
- **Sécurité** : refresh tokens stockés **hashés** (`Session.tokenHash`). En prod, le serveur
  refuse de démarrer avec le `JWT_SECRET` de dev ou un `REGISTRATION_MODE=invite` sans code.
- **Slots** : générés à la création du casier, **régénérés** au resize. Numérotation
  `ROW_MAJOR`/`COL_MAJOR` + `startNumber` — logique dans `lib/slots.ts` (testée).

## Tests

Les parsers Vivino sont testés sur des **captures HTML réelles** (`providers/__fixtures__/`,
FR + EN). Si Vivino change son markup, la CI casse volontairement — c'est le signal. Couverts
aussi : numérotation des slots, déduplication, heuristiques d'accords. Ajouter un test quand on
touche à l'un de ces quatre domaines.

## Modèle Gemini

Défaut `gemini-3.1-flash-lite` (`GEMINI_MODEL`, Google AI Studio, free tier). Recherche web
(`AI_ENABLE_GROUNDING`) désactivée par défaut : les données Vivino sont déjà en base.

## Déploiement

Push sur `main` → typecheck → tests → build image → GHCR → SSH VPS → `docker compose pull && up -d`
avec attente du healthcheck et backup préalable de la base. Détails et secrets requis dans le
`README.md`. Sauvegarde : `backup.sh` (utilise `sqlite3 .backup`, jamais `cp` — WAL).
