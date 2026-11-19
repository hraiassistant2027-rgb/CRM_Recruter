#!/usr/bin/env bash
# Створює чисту базу, застосовує шим Supabase, усі міграції і тести.
# Використання: PGHOST=/tmp/pg PGUSER=postgres ./supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=${TEST_DB:-hrcrm_test}
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"

run() { psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }

run supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  run "$f"
done
echo "Міграції застосовано."
for f in supabase/tests/[1-9]*.sql; do
  echo "→ $f"
  psql -q -X -v ON_ERROR_STOP=1 -o /dev/null -d "$DB" -f "$f" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR): +//'
  test "${PIPESTATUS[0]}" -eq 0
done
echo "Усі тести пройдено."
