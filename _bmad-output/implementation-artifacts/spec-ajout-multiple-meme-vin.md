---
title: 'Ajouter plusieurs exemplaires d’un même vin'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: 'e33bc84d083aef136845fad8e9cd12e60e49c9b3'
context:
  - 'CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L’écran d’ajout ne permet de ranger qu’une bouteille à la fois. Pour un carton de bouteilles identiques, l’utilisateur doit répéter la recherche et la saisie alors que seule la position physique change.

**Approach:** Conserver intégralement le parcours unitaire, tout en autorisant la sélection de plusieurs emplacements libres d’un même casier ou leur saisie sous forme de liste et de plages. Le serveur créera un exemplaire physique par emplacement, relié à une seule fiche vin, dans une transaction « tout ou rien ».

## Boundaries & Constraints

**Always:** Maintenir la compatibilité du contrat historique `slotNumber`; limiter un ajout à 100 emplacements uniques d’un seul casier; répliquer note, prix d’achat et photo sur chaque exemplaire; valider tous les emplacements avant création; ne créer aucun exemplaire si un emplacement est absent ou occupé; conserver la présélection `?rackId=&slot=`; présenter les libellés et erreurs en français; lancer la CI/CD après validation locale.

**Ask First:** Toute extension à plusieurs casiers dans une seule opération; toute modification destructive ou migration susceptible de bloquer des données existantes; toute divergence fonctionnelle découverte qui impose de changer ce comportement.

**Never:** Envoyer une succession d’appels unitaires pouvant produire un lot partiel; dupliquer la fiche catalogue `Wine`; remplacer ou dégrader l’ajout d’une bouteille; ignorer silencieusement un doublon ou un emplacement invalide; créer un sous-ensemble du lot demandé.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ajout unitaire historique | `slotNumber: 12` libre | Une bouteille créée; réponse historique préservée | Erreurs existantes conservées |
| Lot par sélection | `[12, 14, 15]` libres dans un casier | Trois bouteilles, même `wineId`, emplacements distincts | Transaction complète |
| Saisie par plages | `12, 14, 20-27` | Dix numéros sélectionnés et affichés avant envoi | Message local si syntaxe, plage ou doublon invalide |
| Emplacement indisponible | Un numéro inexistant ou occupé dans le lot | Aucune bouteille créée | 400 pour absent, 409 pour occupé, numéros concernés retournés |
| Changement de casier | Une sélection existe puis le casier change | Sélection vidée pour éviter une affectation ambiguë | Information visible dans le formulaire |
| Double saisie / dépassement | Numéro répété ou plus de 100 positions | Requête refusée sans création | Erreur explicite au champ ou à l’API |

</frozen-after-approval>

## Code Map

- `packages/shared/src/schemas.ts` -- contrat Zod rétrocompatible et limites communes.
- `packages/shared/src/schemas.test.ts` -- validation des formes unitaire et multiple.
- `apps/server/src/routes/bottles.ts` -- validation globale des positions et création transactionnelle du lot.
- `apps/server/src/routes/bottles.test.ts` -- contrat unitaire, lot et refus atomique des emplacements indisponibles.
- `apps/server/src/services/wines.ts` -- réutilisation transactionnelle de la fiche vin et de ses accords.
- `apps/web/src/views/AddBottleView.vue` -- sélection multiple, saisie textuelle et retour utilisateur.
- `apps/web/src/lib/slotSelection.ts` -- analyse pure des listes et plages d’emplacements.
- `apps/web/src/lib/slotSelection.test.ts` -- couverture des syntaxes et erreurs de saisie.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/schemas.ts` et tests -- accepter exactement `slotNumber` ou `slotNumbers`, borner, dédupliquer et conserver le client historique.
- [x] `apps/server/src/services/wines.ts` -- permettre l’upsert dans la transaction appelante sans transaction imbriquée.
- [x] `apps/server/src/routes/bottles.ts` -- résoudre tous les emplacements puis créer le lot atomiquement et renvoyer `{ bottle, bottles }`.
- [x] `apps/web/src/lib/slotSelection.ts` et tests -- analyser nombres, séparateurs et plages sans ambiguïté.
- [x] `apps/web/src/views/AddBottleView.vue` -- transformer les positions en sélection multiple accessible, avec compteur, retrait, effacement et CTA dynamique.
- [x] Projet -- exécuter typecheck, tests et builds, relire le diff, puis pousser sur `main` et surveiller la CI/CD jusqu’à son terme.

**Acceptance Criteria:**
- Given un vin et dix emplacements libres d’un casier, when l’utilisateur les sélectionne ou saisit une liste/plage puis confirme, then dix bouteilles physiques sont créées sur une fiche vin unique et apparaissent dans la cave.
- Given un seul emplacement, when l’utilisateur suit le parcours existant, then le comportement reste identique et le serveur accepte encore `slotNumber`.
- Given une sélection multiple, when l’utilisateur ouvre la feuille des emplacements, then il peut cocher plusieurs positions sans fermeture automatique, voir le compteur, terminer ou tout effacer.
- Given une sélection contenant une position invalide ou occupée, when l’ajout est demandé, then aucun exemplaire n’est persisté et les positions concernées sont indiquées.
- Given une CI/CD déclenchée après les vérifications locales, when le workflow se termine, then son résultat est contrôlé et communiqué.

## Spec Change Log

## Design Notes

Le lot reste volontairement limité à un casier : l’écran possède déjà ce contexte et chaque numéro y est non ambigu. La réponse ajoute `bottles` tout en gardant `bottle` comme premier exemplaire pour les consommateurs existants. La saisie accepte notamment `12, 14, 20-27`; elle est convertie en sélection visible avant soumission, ce qui évite une création surprise.

## Verification

**Commands:**
- `npm run typecheck` -- aucun diagnostic TypeScript.
- `npm test` -- 160 tests unitaires passent.
- `npm run lint` -- aucune erreur ESLint.
- `npm run build` -- les applications compilent pour la production.
- `git diff --check` -- aucune erreur d’espacement.
- Surveillance des workflows GitHub Actions déclenchés par le push -- CI et déploiement terminent avec succès.

## Suggested Review Order

**Création atomique du lot**

- L’entrée API valide toutes les positions avant une insertion groupée transactionnelle.
  [`bottles.ts:35`](../../apps/server/src/routes/bottles.ts#L35)

- L’upsert catalogue rejoint la transaction appelante sans transaction imbriquée.
  [`wines.ts:14`](../../apps/server/src/services/wines.ts#L14)

**Contrat rétrocompatible**

- Le schéma accepte exactement une position historique ou une liste bornée et unique.
  [`schemas.ts:215`](../../packages/shared/src/schemas.ts#L215)

- Les erreurs regroupent positions absentes et occupées sans masquer un conflit.
  [`bottles.ts:95`](../../apps/server/src/routes/bottles.ts#L95)

**Parcours multi-emplacements**

- L’état de sélection garde le parcours unitaire et protège les saisies non appliquées.
  [`AddBottleView.vue:125`](../../apps/web/src/views/AddBottleView.vue#L125)

- La saisie développe listes et plages, tout en refusant doublons et dépassements.
  [`slotSelection.ts:12`](../../apps/web/src/lib/slotSelection.ts#L12)

- Le formulaire affiche compteur, conflits, retrait et sélection persistante dans la feuille.
  [`AddBottleView.vue:680`](../../apps/web/src/views/AddBottleView.vue#L680)

**Preuves de non-régression**

- Les tests de route couvrent lot, contrat historique, conflits mixtes et échec transactionnel.
  [`bottles.test.ts:98`](../../apps/server/src/routes/bottles.test.ts#L98)

- Les tests partagés couvrent exclusivité, doublons, limites et messages français.
  [`schemas.test.ts:130`](../../packages/shared/src/schemas.test.ts#L130)

- Le parseur est testé sur plages, séparateurs, doublons et bornes communes.
  [`slotSelection.test.ts:5`](../../apps/web/src/lib/slotSelection.test.ts#L5)
