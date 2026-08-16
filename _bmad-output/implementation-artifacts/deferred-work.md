# Travail différé

## Audit du 2026-08-16 — changements casiers préexistants

Ces constats concernent des modifications déjà présentes avant la refonte accueil/navigation et ne sont pas causés par cette story :

- Sécuriser le redimensionnement accompagné d'une renumérotation : les nouveaux numéros peuvent entrer en collision avec les emplacements conservés pendant la transaction.
- Borner `startNumber + rows × cols - 1` et les numéros générés par `reconcileSlots` à `MAX_SLOT_NUMBER`.
- Remplacer les milliers d'`update` Prisma séquentiels lors d'une renumérotation de très grand casier par une stratégie transactionnelle bornée.
- Produire des repères de rangée alphabétiques valides au-delà de Z dans `RackGrid.vue`.
- Rendre les colonnes virtualisées du casier accessibles au clavier et borner le coût des casiers comportant beaucoup de rangées.
- Paginer ou virtualiser la feuille de sélection lorsque plusieurs milliers d'emplacements sont libres dans `AddBottleView.vue`.
