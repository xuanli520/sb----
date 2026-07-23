#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://127.0.0.1:${HTTP_PORT:-8080}}"
endpoint="${base_url%/}/api/novel/public/home"

command -v curl >/dev/null 2>&1 || {
  printf 'verify-public-home: curl is required\n' >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  printf 'verify-public-home: node is required\n' >&2
  exit 1
}

body="$(curl --fail --silent --show-error "$endpoint")"
node -e '
const response = JSON.parse(process.argv[1]);
const data = response && response.data;
if (!data || !Array.isArray(data.carousel) || !Array.isArray(data.hot) || !Array.isArray(data.hotSearchTerms)) {
  throw new Error("home response is missing discovery collections");
}
' "$body"

printf 'Public home verification passed: %s\n' "$endpoint"
