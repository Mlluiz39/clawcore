#!/usr/bin/env bash
# Backup do SQLite (WAL) do ClawCore — seguro para rodar com o container ativo.
# Uso: ./scripts/backup-db.sh [dir_destino]   (padrão: ./backups)
#
# Cron sugerido (todo dia às 03:00):
#   0 3 * * * cd /home/$USER/clawcore && ./scripts/backup-db.sh >> /var/log/clawcore-backup.log 2>&1
set -euo pipefail

CONTAINER="${BACKUP_CONTAINER:-clawcore_backend}"
DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
REMOTE="/tmp/clawcore-backup-${STAMP}.db"
KEEP="${BACKUP_KEEP:-14}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERRO: container '$CONTAINER' não está rodando." >&2
  exit 1
fi

mkdir -p "$DEST"

# db.backup() é o único jeito consistente de copiar um banco em WAL
docker exec -e OUT="$REMOTE" "$CONTAINER" node -e '
  const Database = require("better-sqlite3");
  const db = new Database("data/clawcore.db", { readonly: true });
  db.backup(process.env.OUT).then(() => db.close());
'

docker exec "$CONTAINER" test -f "$REMOTE"
docker cp "$CONTAINER:$REMOTE" "$DEST/clawcore-${STAMP}.db"
docker exec "$CONTAINER" rm -f "$REMOTE"

# Rotacao: mantem apenas os ultimos KEEP backups
ls -1t "$DEST"/clawcore-*.db 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "Backup OK: $DEST/clawcore-${STAMP}.db ($(du -h "$DEST/clawcore-${STAMP}.db" | cut -f1))"
