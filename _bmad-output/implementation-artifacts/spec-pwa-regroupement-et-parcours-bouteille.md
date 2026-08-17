---
title: 'PWA, regroupement des vins et finition des parcours bouteille'
type: 'feature'
created: '2026-08-17'
status: 'done'
baseline_commit: 'a4ce5569acf091dc26183dfa885605a84114cad2'
context:
  - 'CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La cave affiche chaque exemplaire comme un vin distinct, les actions réussies
manquent de retour, la dégustation n'est pas modifiable après ouverture et les recherches
courtes n'utilisent jamais les trois crédits IA. Le socle PWA existe mais n'expose ni
installation, ni mise à jour, ni état hors connexion compréhensible.

**Approach:** Regrouper l'affichage par fiche `Wine` sans perdre les `Bottle` physiques,
permettre l'ouverture atomique d'un ou plusieurs slots, ajouter des notifications globales et
l'édition différée de dégustation, automatiser les trois recherches IA quotidiennes, puis
finaliser l'expérience PWA sans mettre l'API en cache.

## Boundaries & Constraints

**Always:** Grouper strictement par `wine.id` (millésimes distincts séparés) ; afficher `15 +2`
pour trois exemplaires ; nommer le casier en cas d'ambiguïté ; ouvrir uniquement les slots
cochés dans une transaction tout-ou-rien ; copier la note/commentaire communs sur les
bouteilles ouvertes, ensuite modifiables individuellement ; garder la suppression unitaire ;
exécuter le SQL avant l'IA ; ne consommer l'IA qu'à la validation d'un texte d'au moins trois
caractères et jamais sur filtre/frappe ; respecter accessibilité et mouvement réduit.

**Ask First:** Regrouper plusieurs millésimes ; supprimer en lot ; saisir des dégustations
différentes dans une même ouverture ; augmenter le quota IA ; cacher ou muter les données de
cave hors ligne.

**Never:** Dédupliquer par ressemblance textuelle ; remplacer les `Bottle` par un compteur ;
ouvrir un lot via des appels unitaires ; annoncer un succès avant la réponse serveur ; cacher
un flag IA coupé, une clé absente ou un quota vide ; mettre `/api/*` en cache.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Groupe | Même `wine.id` en 15, 16, 17 | Une carte `15 +2`, fiche avec les trois slots | Slot sans position signalé ; casiers nommés |
| Recherche groupée | Trois copies correspondent | Une carte, trois slots allumés, « 1 vin · 3 bouteilles » | Aucun résultat perdu |
| Ouverture simple/multiple | 16 seul ou 15+17 cochés | Modale, CTA dynamique, historique et slots libérés atomiquement | 409 avec conflits, aucune écriture partielle |
| Suppression | Exemplaire actif 16 | Seul 16 est supprimé | Confirmation conservée sur erreur |
| Dégustation différée | Note/commentaire absents ou existants | Ajout, modification ou effacement depuis la fiche bue | Valeurs invalides refusées sans perte |
| IA quotidienne | Trois textes validés puis un quatrième | SQL immédiat + IA pour trois succès, puis SQL expliqué | Échec IA non décompté ; états explicites |
| PWA | Installation, mise à jour ou réseau absent | Installation native/aide iOS, mise à jour choisie, bandeau hors ligne | Coque seule en cache, aucune fausse déconnexion |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/bottleGroups.ts`, `BottleList.vue`, `CellarView.vue`, `format.ts` -- groupes,
  tri, badge, surbrillance et compteurs vins/bouteilles.
- `packages/shared/src/schemas.ts`, `apps/server/src/routes/bottles.ts`, `BottleView.vue` --
  détail du stock, ouverture multiple atomique et dégustation modifiable.
- `apps/web/src/stores/notifications.ts`, `components/NotificationHost.vue`, `App.vue` -- retours
  globaux persistant pendant la navigation.
- `searchIntent.ts`, `SearchPanel.vue`, `routes/ai.ts`, `services/sommelier.ts`,
  `sommelierSlots.ts` -- IA automatique et recommandations groupées par `Wine`.
- `vite.config.ts`, `main.ts`, `stores/pwa.ts`, `stores/auth.ts`, `lib/api.ts`, `index.html` --
  installation, mises à jour, connectivité et distinction réseau/session.

## Tasks & Acceptance

**Execution:**

- [x] `bottleGroups.ts`, `BottleList.vue`, `CellarView.vue`, `format.ts` -- regrouper et tester
  par `wine.id`, ordonner casier/slot, afficher `+N` et des compteurs exacts.
- [x] `schemas.ts`, `routes/bottles.ts`, `BottleView.vue` -- renvoyer les exemplaires actifs ;
  sélectionner un ou plusieurs slots dans une `BottomSheet` ; valider et ouvrir le lot dans
  une transaction ; conserver l'ancien endpoint unitaire et la suppression unitaire.
- [x] `notifications.ts`, `NotificationHost.vue`, `App.vue` -- afficher après succès les
  messages singulier/pluriel accessibles, fermables et compatibles mouvement réduit.
- [x] `schemas.ts`, `routes/bottles.ts`, `BottleView.vue` -- accepter `personalRating` nullable
  dans `PATCH`, puis éditer/effacer étoiles et commentaire d'une bouteille `DRUNK`.
- [x] `searchIntent.ts`, `SearchPanel.vue`, `routes/ai.ts`, `sommelier.ts`, schémas/types --
  utiliser automatiquement l'IA sur tout texte validé admissible ; distinguer flag, clé,
  quota et panne ; envoyer une ligne par vin avec tous ses emplacements et les allumer tous.
- [x] `vite.config.ts`, `stores/pwa.ts`, `main.ts`, `App.vue`, `api.ts`, `auth.ts` -- contrôler
  installation/mise à jour ; rendre le hors-ligne visible ; imposer `NetworkOnly` à l'API ; ne
  vider la session que sur un vrai 401 et conserver seulement le profil minimal hors ligne.
- [x] Tests -- couvrir regroupement multi-casiers, lots/conflits atomiques, édition nullable,
  notifications, intention et slots IA, états PWA et erreurs réseau/session.

**Acceptance Criteria:**

- Given un vin aux slots 15, 16 et 17, when la liste puis la fiche s'affichent, then une seule
  carte `15 +2` mène à la liste exhaustive des trois emplacements.
- Given plusieurs slots cochés, when l'ouverture est confirmée, then tous passent ensemble à
  l'historique ou aucun, et une notification énumère les emplacements libérés.
- Given une bouteille bue sans évaluation, when sa fiche historique est éditée, then note et
  commentaire peuvent être ajoutés, modifiés ou effacés.
- Given trois crédits IA, when trois textes sont validés, then SQL puis IA répondent ; la
  validation suivante reste en SQL et en indique la raison.
- Given le build servi en HTTPS, when l'application est installée, mise à jour ou ouverte sans
  réseau, then son état est explicite et aucune réponse API périmée n'est utilisée.

## Spec Change Log

## Design Notes

Le détail reste routé par un `Bottle` représentatif mais renvoie `activeBottles`; le slot
d'origine est présélectionné. L'ouverture groupée reçoit des IDs uniques d'un même vin,
mémorise les positions avant de détacher les slots et vérifie le compte d'`updateMany` dans la
transaction. Les recommandations IA ciblent `wineId` et retournent toutes leurs locations avec
`rackId`, afin d'éviter doublons et casiers homonymes.

## Verification

**Commands:**

- `npm run typecheck` -- aucun diagnostic sur les trois workspaces.
- `npm test` -- 199 tests réussis : 49 shared, 73 serveur et 77 web.
- `npm run lint` -- aucune erreur.
- `npm run build` -- manifest et service worker générés, API en `NetworkOnly`.
- `git diff --check` -- diff propre.
- `gh run watch` -- CI et déploiement déclenchés par `main` terminent avec succès.

**Manual checks:** à 320 px et sur bureau, vérifier `15 +2`, deux casiers homonymes, sélection
multiple/focus/Échap, notifications, édition historique, séquence IA 3 puis SQL, installation
Chromium, aide iOS, mise à jour choisie et bandeau hors connexion.

## Suggested Review Order

**Stock groupé et actions physiques**

- Point d’entrée : une carte par `wine.id`, triée selon la cave physique.
  [`BottleList.vue:50`](../../apps/web/src/components/BottleList.vue#L50)

- Le serveur ouvre tout le lot ou annule, en vérifiant aussi les slots lus.
  [`bottles.ts:46`](../../apps/server/src/routes/bottles.ts#L46)

- La fiche présélectionne le slot courant et traite les conflits sans boucle.
  [`BottleView.vue:123`](../../apps/web/src/views/BottleView.vue#L123)

- La feuille rend chaque exemplaire sélectionnable avant l’ouverture commune.
  [`BottleView.vue:512`](../../apps/web/src/views/BottleView.vue#L512)

**Recherche SQL et sommelier**

- Toute validation admissible exécute SQL puis IA, jamais pendant la frappe.
  [`SearchPanel.vue:246`](../../apps/web/src/components/SearchPanel.vue#L246)

- Le quota journalier réserve séquentiellement trois crédits persistés en base.
  [`sommelier.ts:185`](../../apps/server/src/services/sommelier.ts#L185)

- Le statut sépare flag, configuration et quota pour expliquer chaque repli SQL.
  [`ai.ts:16`](../../apps/server/src/routes/ai.ts#L16)

**PWA, réseau et session**

- L’initialisation capte installation, mise à jour et erreurs sans bloquer l’application.
  [`pwa.ts:49`](../../apps/web/src/stores/pwa.ts#L49)

- Le client distingue panne réseau, refresh expiré et réponse de session invalide.
  [`api.ts:85`](../../apps/web/src/lib/api.ts#L85)

- Le profil minimal survit hors ligne puis se revalide au retour du serveur.
  [`auth.ts:82`](../../apps/web/src/stores/auth.ts#L82)

- Les bandeaux globaux rendent hors-ligne, panne PWA et mise à jour explicites.
  [`App.vue:308`](../../apps/web/src/App.vue#L308)

**Dégustation, retours et preuves**

- La dégustation historique accepte ajout, modification et effacement différés.
  [`BottleView.vue:164`](../../apps/web/src/views/BottleView.vue#L164)

- Les notifications persistent pendant la navigation et restent fermables.
  [`notifications.ts:14`](../../apps/web/src/stores/notifications.ts#L14)

- Les tests d’ouverture couvrent succès, conflits, null et compatibilité unitaire.
  [`bottles.test.ts:340`](../../apps/server/src/routes/bottles.test.ts#L340)

- Les tests PWA couvrent initialisation, installation et échec de mise à jour.
  [`pwa.test.ts:41`](../../apps/web/src/stores/pwa.test.ts#L41)

- Workbox précache la coque et force exclusivement l’API au réseau.
  [`vite.config.ts:11`](../../apps/web/vite.config.ts#L11)
