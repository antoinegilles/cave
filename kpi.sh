#!/bin/sh
# Tableau de bord produit de la cave.
#
# Lecture seule, aucune dépendance : tout est déjà en base. Les dates Prisma/SQLite
# sont des entiers en millisecondes, d'où les `datetime(col/1000,'unixepoch')`.
#
# Sur le VPS :   ./kpi.sh
# En local :     DATA_DIR=./data ./kpi.sh

set -e

DATA_DIR="${DATA_DIR:-./data}"
DB="$DATA_DIR/cave.db"

# Exécuté dans le conteneur si disponible — la base y est ouverte en WAL, une lecture
# concurrente ne gêne pas l'application.
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cave$'; then
  run_sql() { docker exec -i cave sqlite3 /app/data/cave.db; }
elif [ -f "$DB" ]; then
  run_sql() { sqlite3 "$DB"; }
else
  echo "Aucune base trouvée ($DB) et pas de conteneur cave en cours." >&2
  exit 1
fi

run_sql <<'SQL'
.headers on
.mode column

.print '───── ADOPTION ─────'
-- Qui se sert réellement de la cave. Un compte sans bouteille rangée est un compte mort.
SELECT
  name AS utilisateur,
  role,
  date(createdAt/1000,'unixepoch') AS inscrit_le,
  COALESCE(date(lastLoginAt/1000,'unixepoch'),'jamais') AS derniere_visite,
  (SELECT COUNT(*) FROM Bottle b WHERE b.addedById = User.id) AS bouteilles_rangees
FROM User
ORDER BY createdAt;

.print ''
.print '───── BOUCLE PRODUIT (12 derniers mois) ─────'
-- Rangements et dégustations par mois. Un mois sans dégustation = la cave sert
-- de coffre-fort, pas d'aide à la décision : c'est le signal d'alerte produit.
SELECT
  mois,
  SUM(rangees) AS rangees,
  SUM(bues) AS bues
FROM (
  SELECT strftime('%Y-%m', addedAt/1000,'unixepoch') AS mois, 1 AS rangees, 0 AS bues FROM Bottle
  UNION ALL
  SELECT strftime('%Y-%m', drunkAt/1000,'unixepoch'), 0, 1 FROM Bottle WHERE drunkAt IS NOT NULL
)
GROUP BY mois
ORDER BY mois DESC
LIMIT 12;

.print ''
.print "───── VOIE D'ACQUISITION ─────"
-- LE chiffre produit : par où les fiches entrent vraiment. Une part écrasante de
-- MANUAL signifie que le scan et Vivino ne gagnent pas leur place.
SELECT
  source,
  COUNT(*) AS fiches,
  ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM Wine),0), 1) AS pct
FROM Wine
GROUP BY source
ORDER BY fiches DESC;

.print ''
.print '───── QUALITÉ DES FICHES ─────'
-- L'allumage des emplacements repose entièrement sur les accords : une fiche sans
-- accord est invisible à la recherche « poisson ». C'est un KPI de couverture, pas
-- de confort.
SELECT
  COUNT(*) AS fiches,
  SUM(CASE WHEN vivinoRating IS NOT NULL THEN 1 ELSE 0 END) AS avec_note,
  SUM(CASE WHEN (SELECT COUNT(*) FROM WineFoodTag t WHERE t.wineId = Wine.id) > 0
           THEN 1 ELSE 0 END) AS avec_accords,
  ROUND(100.0 * SUM(CASE WHEN (SELECT COUNT(*) FROM WineFoodTag t WHERE t.wineId = Wine.id) > 0
           THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) AS pct_cherchables
FROM Wine;

.print ''
.print '───── STOCK ─────'
SELECT
  (SELECT COUNT(*) FROM Bottle WHERE status='IN_CELLAR') AS en_cave,
  (SELECT COUNT(*) FROM Bottle WHERE status='DRUNK') AS bues,
  (SELECT COUNT(*) FROM Slot) AS emplacements,
  ROUND(100.0 * (SELECT COUNT(*) FROM Bottle WHERE status='IN_CELLAR')
        / NULLIF((SELECT COUNT(*) FROM Slot),0), 1) AS pct_occupation;

.print ''
.print '───── SOMMELIER IA ─────'
-- Tokens = la facture. Le free tier Gemini est large, mais c'est ici qu'on verrait
-- une dérive avant qu'elle ne coûte.
SELECT
  COUNT(*) AS requetes,
  SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS echecs,
  COALESCE(SUM(tokensIn),0) AS tokens_in,
  COALESCE(SUM(tokensOut),0) AS tokens_out,
  COALESCE(date(MAX(createdAt)/1000,'unixepoch'),'—') AS derniere_requete
FROM AiQuery;

.print ''
.print '───── CACHE VIVINO ─────'
-- Chaque ligne est un scraping qui n'aura pas lieu deux fois. C'est la mesure
-- directe du garde-fou anti-blocage.
SELECT COUNT(*) AS fiches_en_cache FROM ScrapeCache;
SQL
