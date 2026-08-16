---
title: 'Modernisation de l’accueil et de la navigation'
type: 'feature'
created: '2026-08-15'
status: 'done'
baseline_commit: '9b501df27a81f64f568cb461b8a891cc07a7a74f'
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L’application utilise déjà Tailwind v4, mais son shell et sa page d’accueil restent chargés, avec des émojis d’interface, des actions surdimensionnées et des contrôles de recherche, filtres, tri et affichage dispersés. Sur mobile, ces choix réduisent notamment la place du champ de recherche et multiplient les boutons concurrents.

**Approach:** Harmoniser le langage visuel Tailwind de l’application autour de jetons modernes et de Heroicons, puis simplifier l’accueil avec une recherche à action terminale, une barre compacte réunissant filtres, tri bidirectionnel et mode d’affichage, et des filtres appliqués automatiquement.

## Boundaries & Constraints

**Always:** Conserver et compléter les changements non commités existants ; préserver les cibles tactiles de 44 px, les libellés accessibles, le focus clavier, le thème persisté et les safe areas mobiles ; utiliser les jetons Tailwind sémantiques ; garder les émojis uniquement lorsqu’ils représentent une donnée métier (accords mets-vins) ; faire des rafraîchissements automatiques de filtres en SQL uniquement et garantir que la dernière interaction gagne.

**Ask First:** Toute modification de l’API, du modèle de données, du quota IA ou du contenu fonctionnel d’une vue autre que son habillage et ses icônes.

**Never:** Réécrire la grille SVG du casier, déclencher le sommelier IA lors d’un clic de filtre, supprimer la recherche par Entrée, masquer les options sur petit écran, ou remplacer les changements déjà présents par une ancienne version des fichiers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Recherche | Texte puis Entrée ou clic sur l’icône terminale | Une seule soumission, sans gros bouton « Chercher » | L’erreur existante reste visible sans casser les contrôles |
| Facette automatique | Clic sur couleur, accord, profil ou note | Résultats SQL mis à jour immédiatement ; la feuille mobile reste utilisable | Les réponses réseau obsolètes ne remplacent jamais la plus récente |
| Dernier filtre retiré | Texte présent ou champ vide | Recherche texte SQL relancée, ou cave complète restaurée | Aucun appel IA ni état de recherche fantôme |
| Tri | Nouveau critère ou second clic sur le critère actif | Nouveau critère avec direction par défaut ; second clic inverse haut/bas | Critère et direction invalides en stockage retombent sur les défauts |
| Menu compte | Clic sur les trois points, Échap, clic extérieur ou navigation | Identité, thème, administration éventuelle et déconnexion avec icônes ; fermeture prévisible | Le focus et les attributs ARIA restent cohérents |

</frozen-after-approval>

## Code Map

- `apps/web/src/assets/main.css` -- jetons Tailwind, fond, typographie, ombres et comportement global des thèmes.
- `apps/web/src/App.vue` -- en-tête, menu compte et navigation basse responsive.
- `apps/web/src/components/SearchPanel.vue` -- recherche unifiée, filtres et nouvelle barre d’outils de collection.
- `apps/web/src/components/SearchFilters.vue` -- facettes et événements de sélection.
- `apps/web/src/components/BottleList.vue` -- ordre de la liste sans sélecteur de tri encombrant.
- `apps/web/src/views/CellarView.vue` -- composition de l’accueil et suppression des contrôles dupliqués.
- `apps/web/src/stores/prefs.ts` -- persistance du critère et de la direction de tri.
- `apps/web/src/components/BottomSheet.vue`, `apps/web/src/components/PasswordField.vue`, `apps/web/src/views/*.vue` -- remplacement cohérent des glyphes d’action par Heroicons.
- `apps/web/package.json`, `package-lock.json` -- dépendance Vue officielle `@heroicons/vue` de Tailwind Labs.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/package.json`, `package-lock.json`, composants et vues -- installer Heroicons et remplacer les émojis/glyphes d’interface par des icônes cohérentes, sans toucher aux données métier.
- [x] `apps/web/src/App.vue`, `apps/web/src/assets/main.css` -- moderniser le shell, déplacer le thème dans le menu à trois points près de l’avatar et refaire la barre basse.
- [x] `apps/web/src/components/SearchPanel.vue`, `SearchFilters.vue`, `CellarView.vue` -- placer le bouton de recherche dans le champ, garantir un placeholder court avec `...`, fusionner filtres/tri/affichage et appliquer les facettes immédiatement en SQL.
- [x] `apps/web/src/stores/prefs.ts`, `BottleList.vue`, tests associés -- ajouter le tri ascendant/descendant compact, persistant et déterministe.
- [x] Dépôt Git/GitHub Actions -- après succès local, committer l’état validé, pousser `main`, puis suivre la CI et le déploiement jusqu’à leur conclusion.

**Acceptance Criteria:**
- Given une largeur de 320 px ou un écran bureau, when l’accueil s’affiche, then le champ garde un exemple lisible terminé par `...`, son icône terminale lance la recherche et aucun bouton « Chercher » séparé n’apparaît.
- Given la liste des vins, when l’utilisateur organise les résultats, then filtres, critères de tri, direction et bascule liste/plan sont accessibles dans une barre compacte sans quatre gros boutons.
- Given un thème clair ou sombre, when le shell et les vues s’affichent, then leurs actions emploient Tailwind/Heroicons de manière cohérente et le thème se change depuis le menu compte.
- Given un clic de facette, when le serveur répond, then les résultats visibles correspondent à la dernière sélection sans consommer de quota sommelier.
- Given les vérifications locales réussies, when `main` est poussé, then les workflows CI et Déploiement sont déclenchés et leur statut final est rapporté.

## Design Notes

Le contrôle d’organisation doit se lire comme une petite barre d’outils : bouton filtre avec compteur, critères textuels sobres avec flèche de direction sur l’actif, puis icônes liste/plan. Le bouton « Voir les résultats » de la feuille mobile peut rester comme action de fermeture, puisque chaque sélection actualise déjà la page derrière elle.

## Verification

**Commands:**
- `npm run typecheck` -- tous les workspaces passent.
- `npm test` -- tests existants et nouveaux tests de tri passent.
- `npm run build` -- le SPA et le serveur compilent.
- `git diff --check` -- aucune erreur de whitespace.
- `gh run list` / `gh run watch` -- CI et déploiement déclenchés par le push terminent avec succès.

**Manual checks:**
- Vérifier à 320 px et sur bureau : menu compte clavier/Échap, thème, champ de recherche, clics rapides de filtres, tri dans les deux sens, mode liste/plan et safe area de la barre basse.

## Suggested Review Order

**Expérience principale**

- Le shell concentre navigation, compte, thème et raccourcis mobiles accessibles.
  [`App.vue:99`](../../apps/web/src/App.vue#L99)

- La barre unifiée rend filtres, tri et affichage compacts à 320 px.
  [`SearchPanel.vue:361`](../../apps/web/src/components/SearchPanel.vue#L361)

- Les facettes relancent uniquement le SQL et invalident les interactions précédentes.
  [`SearchPanel.vue:205`](../../apps/web/src/components/SearchPanel.vue#L205)

**État et déterminisme**

- La dernière réponse réseau est la seule autorisée à modifier les résultats.
  [`cellar.ts:68`](../../apps/web/src/stores/cellar.ts#L68)

- Un second clic inverse le tri, un nouveau critère reprend son sens naturel.
  [`prefs.ts:97`](../../apps/web/src/stores/prefs.ts#L97)

- Le comparateur garde les données absentes en fin de liste dans les deux sens.
  [`bottleSort.ts:27`](../../apps/web/src/lib/bottleSort.ts#L27)

**Composants partagés**

- Les feuilles modales verrouillent ensemble défilement, arrière-plan et focus.
  [`BottomSheet.vue:60`](../../apps/web/src/components/BottomSheet.vue#L60)

- Les jetons sobres modernisent toutes les vues sans couleurs brutes locales.
  [`main.css:16`](../../apps/web/src/assets/main.css#L16)

- Les recommandations IA ne ciblent que des emplacements réels et non ambigus.
  [`sommelierSlots.ts:22`](../../apps/web/src/lib/sommelierSlots.ts#L22)

**Changements casiers conservés**

- Le schéma partagé borne la taille des nouveaux casiers et leurs dimensions.
  [`schemas.ts:99`](../../packages/shared/src/schemas.ts#L99)

- La réconciliation conserve les bouteilles pendant un redimensionnement.
  [`slots.ts:88`](../../apps/server/src/lib/slots.ts#L88)

- La route admin applique la réconciliation dans une transaction unique.
  [`racks.ts:80`](../../apps/server/src/routes/racks.ts#L80)

**Vérification**

- Les tests couvrent directions, valeurs nulles et ordre stable.
  [`bottleSort.test.ts:56`](../../apps/web/src/lib/bottleSort.test.ts#L56)

- Les courses réseau et l’effacement invalident les réponses devenues obsolètes.
  [`cellar.test.ts:29`](../../apps/web/src/stores/cellar.test.ts#L29)

- L’annonce multi-casiers reste compréhensible pour un lecteur d’écran.
  [`format.test.ts:50`](../../apps/web/src/lib/format.test.ts#L50)
