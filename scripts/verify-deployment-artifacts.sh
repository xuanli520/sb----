#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_BIN="${DOCKER_BIN:-docker}"
run_smoke=false

if [[ "${1:-}" == '--smoke' ]]; then
  run_smoke=true
  shift
fi
[[ $# -eq 0 ]] || {
  printf 'Usage: scripts/verify-deployment-artifacts.sh [--smoke]\n' >&2
  exit 2
}

command -v "$DOCKER_BIN" >/dev/null 2>&1 || {
  printf 'verify-deployment-artifacts: cannot find Docker executable: %s\n' "$DOCKER_BIN" >&2
  exit 1
}

cd "$ROOT"
bash -n scripts/backup-mysql.sh scripts/restore-mysql.sh scripts/backup-restore-smoke.sh scripts/verify-deployment-artifacts.sh
NOVEL_INTERNAL_API_KEY=verification-internal-key \
MYSQL_PASSWORD=verification-mysql-password \
MYSQL_ROOT_PASSWORD=verification-root-password \
MINIO_ROOT_USER=verification-minio-root \
MINIO_ROOT_PASSWORD=verification-minio-root-password \
MINIO_COVER_ACCESS_KEY=verification-cover-writer \
MINIO_COVER_SECRET_KEY=verification-cover-writer-secret \
NOVEL_PUBLIC_ORIGIN=https://novel.example.test \
"$DOCKER_BIN" compose config --quiet
"$DOCKER_BIN" run --rm \
  -v "$ROOT/infra/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine nginx -t

if [[ "$run_smoke" == true ]]; then
  "$ROOT/scripts/backup-restore-smoke.sh"
fi

printf 'Deployment artifact validation passed.\n'
