#!/bin/sh
# Sauvegarde de la cave.
#
# `sqlite3 .backup` plutôt qu'une copie de fichier : en mode WAL, un simple `cp`
# peut capturer une base incohérente si une écriture est en cours.
#
# Installation en cron quotidien sur le VPS :
#   0 3 * * * cd /chemin/vers/cave && ./backup.sh >> backup.log 2>&1

set -e

DATA_DIR="${DATA_DIR:-./data}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DB="$DATA_DIR/cave.db"

[ -f "$DB" ] || { echo "Aucune base à sauvegarder ($DB)"; exit 0; }

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
TARGET="$BACKUP_DIR/cave-$STAMP.db"

# Exécuté dans le conteneur si docker est disponible, sinon en local.
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q '^cave$'; then
  docker exec cave sqlite3 /app/data/cave.db ".backup '/app/data/.backup-tmp.db'"
  mv "$DATA_DIR/.backup-tmp.db" "$TARGET"
else
  sqlite3 "$DB" ".backup '$TARGET'"
fi

gzip -9 "$TARGET"
echo "Sauvegarde : $TARGET.gz ($(du -h "$TARGET.gz" | cut -f1))"

# Rotation
find "$BACKUP_DIR" -name 'cave-*.db.gz' -type f -mtime "+$KEEP_DAYS" -delete
echo "Sauvegardes conservées : $(find "$BACKUP_DIR" -name 'cave-*.db.gz' | wc -l | tr -d ' ')"
