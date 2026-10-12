#!/bin/sh
# Builds a LOCAL database for docker compose / CI: bootstrap SQL -> prisma db push -> seed.
# Never point this at the shared Supabase database (the README forbids db push there).
# The schema is created only once; to rebuild it after changing schema.prisma: docker compose down -v
set -e

case "$DATABASE_URL" in
  *supabase*) echo "db-setup: refusing to run against Supabase"; exit 1 ;;
esac

set +e; node docker/db-has-schema.js; has_schema=$?; set -e
if [ "$has_schema" = 0 ]; then
  echo "db-setup: tables already exist, skipping schema creation"
elif [ "$has_schema" = 1 ]; then
  echo "db-setup: creating gen_id() and ID sequences"
  npx prisma db execute --file docker/db-bootstrap.sql --schema prisma/schema.prisma

  echo "db-setup: creating tables from schema.prisma"
  npx prisma db push --skip-generate

  echo "db-setup: adding Supabase-only columns used by the seed"
  npx prisma db execute --file docker/db-legacy.sql --schema prisma/schema.prisma

  echo "db-setup: loading seed data"
  node seed.js

  echo "db-setup: setting the test accounts' password (README: Test@1234)"
  node scripts/set-test-passwords.js "${TEST_USER_PASSWORD:-Test@1234}"
else
  exit 1
fi

if [ "$has_schema" = 0 ]; then
  echo "db-setup: loading seed data (skips rows that already exist)"
  node seed.js
fi

echo "db-setup: done"
