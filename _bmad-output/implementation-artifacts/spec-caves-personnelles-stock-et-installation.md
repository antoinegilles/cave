---
title: 'Caves personnelles, stock multi-emplacements et installation guidée'
type: 'feature'
created: '2026-08-18'
status: 'done'
baseline_commit: '7c5143972f8f18e198820057e7c3f508ab40d349'
context:
  - 'CLAUDE.md'
  - 'README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cave, recherche, statistiques et conseils sont partagés entre tous les comptes. Les slots sont traités comme mono-bouteille, les exemplaires se gèrent mal et l’installation PWA reste cachée.

**Approach:** Rendre casiers et bouteilles privés, créer une cave par compte et ouvrir ses réglages. Autoriser plusieurs bouteilles par slot, gérer les exemplaires depuis la fiche, renuméroter par rangée, offrir une consultation admin en lecture seule et proposer automatiquement la PWA.

## Boundaries & Constraints

**Always:** `Wine` reste global sans fuite de possession ; une écriture vise seulement `currentUser.id` et ignore `asUser` ; ressource tierce → 404 ; seul un ADMIN lit `asUser`, sans mutation UI ; inscription, création admin et seed créent atomiquement un casier 6×10 ; un slot accepte plusieurs `Bottle`, même différentes ; chaque exemplaire reste une ligne ; gestes atomiques, maximum 100 bouteilles ; déplacer change `slotId`, renuméroter conserve les bouteilles ; l’API n’est jamais cachée.

**Ask First:** Toute suppression ou remise à zéro d’une base réelle ; une capacité maximale fixe par slot ; un stock actif sans emplacement ; la suppression groupée ou la fusion de fiches `Wine`.

**Never:** Compter sur l’UI seule ; rendre `ownerId` nullable ; muter la cave consultée ; remplacer les `Bottle` par un compteur ; forcer le prompt navigateur ; toucher à la base de production.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu | Erreur |
|---|---|---|---|
| Isolation | A possède du stock, B est connecté | B ne voit rien de A | `asUser=A` → 403 ; ID de A en écriture → 404 |
| Admin | ADMIN consulte A | Lectures ciblées, bandeau permanent | Aucun appel ne mute A |
| Stock multiple | slot 1001 déjà occupé, quantité 2 | Deux exemplaires supplémentaires dans 1001 | slot/rack tiers ou absent → aucune création |
| Fiche | vin dans 1001×2 et 4020 | ajout, déplacement, suppression unitaires | dernier supprimé → retour cave |
| Renumérotation | débuts de rangées 1001 et 4020 | valeurs uniques appliquées en transaction | doublon/dépassement → aucune écriture |
| Installation | navigateur éligible non standalone | feuille automatique puis prompt sur clic ; aide iOS | report mémorisé ; aucune offre si installée |

</frozen-after-approval>

## Code Map

- `apps/server/prisma/schema.prisma`, `apps/server/prisma/migrations/`, `apps/server/src/{seed,lib/ownership}.ts` — propriété, cascades, cave initiale.
- `apps/server/src/routes/{auth,admin,racks,bottles,stats,ai}.ts`, `services/{search,sommelier}.ts` — sécurité et contexte ciblé.
- `packages/shared/src/schemas.ts`, `apps/server/src/lib/slots.ts` — placements et renumérotation.
- `apps/web/src/stores/cellar.ts`, `lib/types.ts`, `router.ts`, `App.vue`, vues/composants cave — consultation, réglages et stock multiple.
- `apps/web/src/stores/pwa.ts` et tests serveur/web — installation et preuves.

## Tasks & Acceptance

**Execution:**

- [x] `schema.prisma`, migration, `seed.ts`, `routes/{auth,admin}.ts` — `ownerId`, cascades et casier 6×10 transactionnel.
- [x] `lib/ownership.ts`, routes et services serveur — filtrer les lectures et verrouiller les mutations.
- [x] `schemas.ts`, `lib/slots.ts`, `routes/racks.ts`, `RackSettings.vue` — borne Int32, réglages et renumérotation sûre.
- [x] `routes/bottles.ts`, `lib/types.ts`, `AddBottleView.vue`, `BottleView.vue`, `RackGrid.vue`, `SlotSheet.vue` — quantités, `slot.bottles` et gestion unitaire.
- [x] `stores/cellar.ts`, `App.vue`, `AdminView.vue`, lectures web — propager `asUser`, bandeau et lecture seule.
- [x] `stores/pwa.ts`, `App.vue` — offre automatique, aide iOS, report et exclusion standalone.
- [x] `*.test.ts` serveur/web — isolation de chaque route, lots, stats, sommelier, multi-stock et PWA.

**Acceptance Criteria:**

- Given deux stocks distincts, when chaque compte utilise toutes les lectures, then aucune donnée tierce n’est observable.
- Given un slot occupé, when plusieurs exemplaires identiques ou différents y sont ajoutés, then le plan affiche le compte et la feuille permet d’ouvrir chaque fiche.
- Given une fiche avec plusieurs exemplaires, when l’utilisateur ajoute, déplace ou supprime l’un d’eux, then seuls les identifiants choisis changent et toutes les vues se rafraîchissent.
- Given un admin consultant un tiers, when il navigue, then le bandeau reste visible et le tiers ne peut être muté.
- Given une PWA non installée et éligible, when l’application démarre, then l’offre apparaît automatiquement et le dialogue natif ne part qu’après le clic.

## Spec Change Log

## Design Notes

Normaliser `slotNumber/slotNumbers` vers `{rackId, slotNumber, quantity}` garde les anciens clients PWA. Le détail par `Bottle.id` renvoie les exemplaires actifs du même `wineId` et propriétaire. L’offre PWA est automatique, le prompt système reste déclenché par clic.

## Verification

**Commands:**

- `npm run db:generate && npm run typecheck` — client Prisma et types valides.
- `npm run lint && npm test && npm run build` — qualité, isolation et bundle PWA validés.
- `git diff --check` — diff propre.

**Manual checks:** deux utilisateurs et un admin ; slot multi-vins ; fiche ; renumérotation 1001/4020 ; Chromium/iOS ; aucune action production.

## Suggested Review Order

**Frontière de propriété**

- Introduit la propriété obligatoire au cœur du modèle relationnel.
  [`schema.prisma:45`](../../apps/server/prisma/schema.prisma#L45)

- Répartit sûrement les anciennes caves partagées sans mélanger les propriétaires.
  [`migration.sql:7`](../../apps/server/prisma/migrations/20260818100000_personal_cellars/migration.sql#L7)

- Centralise l’unique exception de lecture accordée aux administrateurs.
  [`ownership.ts:17`](../../apps/server/src/lib/ownership.ts#L17)

- Filtre casiers et bouteilles imbriquées, y compris après migration.
  [`racks.ts:19`](../../apps/server/src/routes/racks.ts#L19)

**Stock physique et exemplaires**

- Normalise placements, quantités et limite atomique de cent bouteilles.
  [`schemas.ts:251`](../../packages/shared/src/schemas.ts#L251)

- Crée chaque bouteille physique dans un slot possédé, même occupé.
  [`bottles.ts:41`](../../apps/server/src/routes/bottles.ts#L41)

- Ajoute et gère tous les exemplaires depuis une fiche commune.
  [`BottleView.vue:411`](../../apps/web/src/views/BottleView.vue#L411)

**Configuration et numérotation**

- Calcule les départs par rangée avec unicité et borne Int32.
  [`slots.ts:78`](../../apps/server/src/lib/slots.ts#L78)

- Applique la renumérotation transactionnelle en deux passes.
  [`racks.ts:226`](../../apps/server/src/routes/racks.ts#L226)

- Offre les réglages personnels et les départs physiques par rangée.
  [`RackSettings.vue:173`](../../apps/web/src/views/RackSettings.vue#L173)

**Consultation administrateur**

- Résout la cible avant montage et interdit les routes d’écriture.
  [`router.ts:39`](../../apps/web/src/router.ts#L39)

- Purge les données privées lors des changements de compte ou cible.
  [`cellar.ts:86`](../../apps/web/src/stores/cellar.ts#L86)

- Rend la lecture seule visible en permanence dans la coque.
  [`App.vue:347`](../../apps/web/src/App.vue#L347)

**Installation et preuves**

- Propose automatiquement l’installation, avec report et aide iOS.
  [`pwa.ts:25`](../../apps/web/src/stores/pwa.ts#L25)

- Prouve le cloisonnement des principales lectures et écritures.
  [`isolation.test.ts:59`](../../apps/server/src/routes/isolation.test.ts#L59)

- Prouve plusieurs exemplaires ajoutés dans un même emplacement.
  [`bottles.test.ts:193`](../../apps/server/src/routes/bottles.test.ts#L193)
