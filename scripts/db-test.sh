#!/bin/bash
# Run the database test suite (migrations + RLS + RPC tests) against a
# plain Postgres — no Docker/Supabase needed. Spins up a throwaway
# database, applies the Supabase shim, all migrations, seed data, then
# the assertions in supabase/tests/db-tests.sql.
#
# Usage:
#   scripts/db-test.sh                      # uses PGHOST/PGPORT/PGUSER or defaults below
#   PGPORT=54322 scripts/db-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-54322}"
export PGUSER="${PGUSER:-postgres}"
DB=quest_test

psql -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"

for f in supabase/tests/supabase-shim.sql supabase/migrations/*.sql supabase/seed.sql; do
  echo "applying $f"
  psql -d $DB -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null
done

psql -d $DB -v ON_ERROR_STOP=1 -f supabase/tests/db-tests.sql 2>&1 \
  | grep -E "PASS:|ERROR|ALL DB TESTS" \
  | sed 's/^psql:[^ ]* //'
