#!/bin/sh
# End-to-end check of a running stack, through nginx exactly like a browser would.
#   sh scripts/smoke-test.sh [base-url]     (default http://localhost:8080)
set -e
BASE="${1:-http://localhost:8080}"

echo "smoke: waiting for $BASE"
i=0
until curl -fsS -o /dev/null "$BASE/"; do
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "smoke: frontend never came up"; exit 1; }
  sleep 2
done

echo "smoke: frontend serves the React app"
curl -fsS "$BASE/" | grep -q '<div id="root"' || { echo "smoke: index.html looks wrong"; exit 1; }

echo "smoke: SPA route falls back to index.html"
curl -fsS -o /dev/null "$BASE/some/deep/link"

echo "smoke: login through /api (seeded admin CST-ICT01)"
TOKEN=$(curl -fsS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"userId":"CST-ICT01","password":"Test@1234"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "smoke: login returned no token"; exit 1; }

echo "smoke: authenticated request"
curl -fsS "$BASE/api/me" -H "Authorization: Bearer $TOKEN" | grep -q '"CST-ICT01"' || { echo "smoke: /api/me failed"; exit 1; }

echo "smoke: unauthenticated request is rejected"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")
[ "$code" = "401" ] || { echo "smoke: expected 401, got $code"; exit 1; }

echo "smoke: all checks passed"
