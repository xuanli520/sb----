#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_BIN="${DOCKER_BIN:-docker}"
MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
MYSQL_DATABASE="${MYSQL_DATABASE:-novel_platform}"

usage() {
  cat <<'EOF'
Usage: scripts/backup-mysql.sh <output.sql.gz>

Creates a transaction-consistent gzip MySQL dump from the Compose mysql service and
writes a sibling .sha256 file. The output must not already exist.

Optional environment:
  DOCKER_BIN       Docker executable (default: docker)
  MYSQL_SERVICE    Compose MySQL service name (default: mysql)
  MYSQL_DATABASE   Database name (default: novel_platform)
EOF
}

die() {
  printf 'backup-mysql: %s\n' "$*" >&2
  exit 1
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    die 'sha256sum or shasum is required to create a recovery checksum'
  fi
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  usage
  exit 0
fi

[[ $# -eq 1 ]] || { usage >&2; exit 2; }
[[ "$MYSQL_DATABASE" =~ ^[A-Za-z0-9_]+$ ]] || die 'MYSQL_DATABASE may contain only letters, digits, and underscores'
[[ "$1" == *.sql.gz ]] || die 'output must end in .sql.gz'
command -v "$DOCKER_BIN" >/dev/null 2>&1 || die "cannot find Docker executable: $DOCKER_BIN"

output="$1"
[[ ! -e "$output" ]] || die "refusing to overwrite existing backup: $output"
mkdir -p "$(dirname "$output")"
temporary_output="${output}.partial.$$"
trap 'rm -f "$temporary_output"' EXIT

cd "$ROOT"
"$DOCKER_BIN" compose exec -T "$MYSQL_SERVICE" sh -ec '
  exec env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump \
    -uroot --single-transaction --quick --routines --events --set-gtid-purged=OFF \
    --databases "$1"
' sh "$MYSQL_DATABASE" | gzip -c > "$temporary_output"

gzip -t "$temporary_output" || die 'generated backup is not a valid gzip archive'
[[ -s "$temporary_output" ]] || die 'generated backup is empty'
mv "$temporary_output" "$output"
checksum="$(hash_file "$output")"
printf '%s  %s\n' "$checksum" "$(basename "$output")" > "${output}.sha256"
trap - EXIT

printf 'Backup written to %s\nChecksum written to %s.sha256\n' "$output" "$output"
