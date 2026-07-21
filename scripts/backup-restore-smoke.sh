#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_BIN="${DOCKER_BIN:-docker}"
SMOKE_COMPOSE_FILE="$ROOT/scripts/backup-restore-smoke.compose.yaml"
project="novel-backup-smoke-${RANDOM}-$$"
workdir="$(mktemp -d)"

cleanup() {
  COMPOSE_FILE="$SMOKE_COMPOSE_FILE" COMPOSE_PROJECT_NAME="$project" "$DOCKER_BIN" compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

command -v "$DOCKER_BIN" >/dev/null 2>&1 || { printf 'backup-restore-smoke: cannot find Docker executable: %s\n' "$DOCKER_BIN" >&2; exit 1; }
export COMPOSE_FILE="$SMOKE_COMPOSE_FILE"
export COMPOSE_PROJECT_NAME="$project"

cd "$ROOT"
"$DOCKER_BIN" compose up --detach
ready=false
for _ in $(seq 1 45); do
  if "$DOCKER_BIN" compose exec -T mysql sh -ec 'exec env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -Nse "SELECT 1"' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || {
  printf 'backup-restore-smoke: MySQL did not become ready within 45 seconds\n' >&2
  exit 1
}
"$DOCKER_BIN" compose exec -T mysql sh -ec '
  exec env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -D novel_backup_smoke -e \
    "CREATE TABLE smoke_entries (id BIGINT PRIMARY KEY, message VARCHAR(255) NOT NULL); INSERT INTO smoke_entries VALUES (1, '\''before-backup'\'');"
'

backup="$workdir/novel-backup-smoke.sql.gz"
MYSQL_DATABASE=novel_backup_smoke "$ROOT/scripts/backup-mysql.sh" "$backup"
"$DOCKER_BIN" compose exec -T mysql sh -ec '
  exec env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -D novel_backup_smoke -e \
    "INSERT INTO smoke_entries VALUES (2, '\''after-backup'\'');"
'
MYSQL_DATABASE=novel_backup_smoke "$ROOT/scripts/restore-mysql.sh" --replace --confirm-replace "$backup"

restored="$("$DOCKER_BIN" compose exec -T mysql sh -ec '
  exec env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -Nse "SELECT GROUP_CONCAT(message ORDER BY id) FROM novel_backup_smoke.smoke_entries"
')"
[[ "$restored" == 'before-backup' ]] || {
  printf 'backup-restore-smoke: expected only the pre-backup row after restore, got: %s\n' "$restored" >&2
  exit 1
}

printf 'Backup/restore smoke test passed.\n'
