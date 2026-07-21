#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_BIN="${DOCKER_BIN:-docker}"
MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
MYSQL_DATABASE="${MYSQL_DATABASE:-novel_platform}"
BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"

usage() {
  cat <<'EOF'
Usage: scripts/restore-mysql.sh --replace --confirm-replace <input.sql.gz>

Verifies the sibling .sha256 file when present, drops and recreates MYSQL_DATABASE,
then imports the gzip dump. This is destructive. The Compose backend service must be
stopped before restore so it cannot write during the replacement.

Optional environment:
  DOCKER_BIN       Docker executable (default: docker)
  MYSQL_SERVICE    Compose MySQL service name (default: mysql)
  MYSQL_DATABASE   Database name (default: novel_platform)
  BACKEND_SERVICE  Service that must be stopped (default: backend)
EOF
}

die() {
  printf 'restore-mysql: %s\n' "$*" >&2
  exit 1
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    die 'sha256sum or shasum is required to verify the recovery checksum'
  fi
}

replace=false
confirmed=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --replace) replace=true; shift ;;
    --confirm-replace) confirmed=true; shift ;;
    --help|-h) usage; exit 0 ;;
    --*) die "unknown option: $1" ;;
    *) break ;;
  esac
done

[[ "$replace" == true ]] || die 'restoration requires --replace --confirm-replace'
[[ "$confirmed" == true ]] || die 'restoration requires --replace --confirm-replace'
[[ $# -eq 1 ]] || { usage >&2; exit 2; }
[[ "$MYSQL_DATABASE" =~ ^[A-Za-z0-9_]+$ ]] || die 'MYSQL_DATABASE may contain only letters, digits, and underscores'
[[ "$1" == *.sql.gz ]] || die 'input must end in .sql.gz'
[[ -f "$1" ]] || die "backup does not exist: $1"
command -v "$DOCKER_BIN" >/dev/null 2>&1 || die "cannot find Docker executable: $DOCKER_BIN"

input="$1"
gzip -t "$input" || die 'input is not a valid gzip archive'
if [[ -f "${input}.sha256" ]]; then
  expected="$(awk 'NR == 1 { print $1 }' "${input}.sha256")"
  actual="$(hash_file "$input")"
  [[ -n "$expected" && "$expected" == "$actual" ]] || die 'backup checksum does not match its sibling .sha256 file'
fi

cd "$ROOT"
running_services="$("$DOCKER_BIN" compose ps --status running --services 2>/dev/null || true)"
if grep -Fxq "$BACKEND_SERVICE" <<<"$running_services"; then
  die "stop the $BACKEND_SERVICE service before restoring so no writes race the replacement"
fi

"$DOCKER_BIN" compose exec -T "$MYSQL_SERVICE" sh -ec '
  database="$1"
  case "$database" in
    *[!A-Za-z0-9_]*|"") exit 2 ;;
  esac
  sql="DROP DATABASE IF EXISTS \`$database\`; CREATE DATABASE \`$database\`;"
  exec env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "$sql"
' sh "$MYSQL_DATABASE"

gzip -cd -- "$input" | "$DOCKER_BIN" compose exec -T "$MYSQL_SERVICE" sh -ec '
  exec env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot
'

printf 'Restored %s into %s. Start %s only after verifying the restored data.\n' "$input" "$MYSQL_DATABASE" "$BACKEND_SERVICE"
