#!/usr/bin/env bash
# Nightly backup of the SQLite database + audio blobs. There is no other copy of
# this data, so wire it into cron, e.g.:
#   17 3 * * *  /opt/meeting-assistant/scripts/backup.sh >> /var/log/ma-backup.log 2>&1
#
# Override the destination with MA_BACKUP_DIR (default: <repo>/backups).
# For continuous point-in-time replication instead, consider litestream.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${ROOT}/backend/meeting.db"
STORAGE="${ROOT}/backend/storage"
DEST="${MA_BACKUP_DIR:-${ROOT}/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP=14

mkdir -p "${DEST}"

# Consistent online snapshot — sqlite3 .backup is WAL-safe while the app runs.
if [ -f "${DB}" ]; then
  sqlite3 "${DB}" ".backup '${DEST}/meeting-${STAMP}.db'"
  echo "db snapshot -> ${DEST}/meeting-${STAMP}.db"
else
  echo "WARN: ${DB} not found, skipping db snapshot" >&2
fi

# Audio blobs.
if [ -d "${STORAGE}/audio" ]; then
  tar -czf "${DEST}/audio-${STAMP}.tar.gz" -C "${STORAGE}" audio
  echo "audio archive -> ${DEST}/audio-${STAMP}.tar.gz"
fi

# Retention: keep the newest ${KEEP} of each kind.
ls -1t "${DEST}"/meeting-*.db 2>/dev/null    | tail -n +$((KEEP + 1)) | xargs -r rm -f
ls -1t "${DEST}"/audio-*.tar.gz 2>/dev/null  | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "backup complete @ ${STAMP}"
