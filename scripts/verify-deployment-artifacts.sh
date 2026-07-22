#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_BIN="${DOCKER_BIN:-docker}"
run_smoke=false

fail() {
  printf 'verify-deployment-artifacts: %s\n' "$1" >&2
  exit 1
}

require_line() {
  local file="$1"
  local expected="$2"
  grep -Fqx -- "$expected" "$file" || fail "missing required deployment invariant in ${file#$ROOT/}: $expected"
}

forbid_literal() {
  local file="$1"
  local forbidden="$2"
  if grep -Fq -- "$forbidden" "$file"; then
    fail "forbidden deployment configuration in ${file#$ROOT/}: $forbidden"
  fi
}

require_service_line() {
  local service="$1"
  local expected="$2"
  awk -v service="$service" -v expected="    $expected" '
    $0 == "  " service ":" { inside = 1; next }
    inside && /^  [A-Za-z0-9_-]+:$/ { exit }
    inside && $0 == expected { found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$ROOT/compose.yaml" || fail "service ${service} must contain: ${expected}"
}

assert_deployment_invariants() {
  local nginx="$ROOT/infra/nginx/default.conf"
  local compose="$ROOT/compose.yaml"
  local ignore="$ROOT/.dockerignore"
  local web_dockerfile="$ROOT/apps/web/Dockerfile"

  require_line "$nginx" '  client_max_body_size 5m;'
  require_line "$nginx" '  location ~ "^/media/covers/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(?:png|jpg)$" {'
  require_line "$nginx" '    if ($request_method != GET) {'
  require_line "$nginx" '      return 405;'
  require_line "$nginx" '    rewrite "^/media/(covers/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(?:png|jpg))$" /novel-covers/$1 break;'
  require_line "$nginx" '  location = /media { return 404; }'
  require_line "$nginx" '  location /media/ { return 404; }'
  forbid_literal "$nginx" 'location ^~ /media/'
  forbid_literal "$nginx" 'rewrite ^/media/(.*)$'

  require_line "$ignore" '.env'
  require_line "$ignore" '.env.*'
  require_line "$ignore" '**/.env'
  require_line "$ignore" '**/.env.*'
  require_line "$ignore" 'node_modules'
  require_line "$ignore" '**/node_modules'
  require_line "$ignore" 'target'
  require_line "$ignore" '**/target'
  require_line "$ignore" '.next'
  require_line "$ignore" '**/.next'
  require_line "$ignore" 'coverage'
  require_line "$ignore" '**/coverage'

  require_service_line mysql 'restart: unless-stopped'
  require_service_line redis 'restart: unless-stopped'
  require_line "$compose" '        if user_add_error="$$(mc admin user add local "$$MINIO_COVER_ACCESS_KEY" "$$MINIO_COVER_SECRET_KEY" 2>&1)"; then'
  require_line "$compose" '            *"already exists"*|*"already in use"*) ;;'
  require_line "$compose" '        mc alias set cover-writer http://minio:9000 "$$MINIO_COVER_ACCESS_KEY" "$$MINIO_COVER_SECRET_KEY"'
  require_line "$compose" '        mc cp /tmp/minio-cover-writer-check cover-writer/novel-covers/covers/.minio-init-writer-check'
  require_line "$compose" '        mc rm --force cover-writer/novel-covers/covers/.minio-init-writer-check'
  forbid_literal "$compose" 'mc admin user add local "$$MINIO_COVER_ACCESS_KEY" "$$MINIO_COVER_SECRET_KEY" || true'
  require_line "$web_dockerfile" 'USER novel'
  require_line "$web_dockerfile" 'COPY --chown=novel:novel --from=build /app/.next/standalone ./'
}

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
assert_deployment_invariants
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
