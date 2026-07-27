#!/usr/bin/env bash
set -euo pipefail

# Run after the local stack is up and migrations are applied:
#   npx supabase db reset
#   bash supabase/tests/llm_daily_cost_budget_concurrency.sh

db_container="${SUPABASE_DB_CONTAINER:-supabase_db_stock-monitor}"
test_tmp="$(mktemp -d "${TMPDIR:-/tmp}/llm-budget-concurrency.XXXXXX")"
background_pid=""

cleanup() {
  if [[ -n "$background_pid" ]] && kill -0 "$background_pid" 2>/dev/null; then
    kill "$background_pid" 2>/dev/null || true
    wait "$background_pid" 2>/dev/null || true
  fi

  docker exec -i "$db_container" psql -X -U postgres -d postgres \
    -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || true
delete from auth.users
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);
SQL

  rm -r "$test_tmp"
}
trap cleanup EXIT

if ! docker inspect "$db_container" >/dev/null 2>&1; then
  echo "Local Supabase database container not found: $db_container" >&2
  exit 1
fi

psql_admin() {
  docker exec -i "$db_container" \
    psql -X -A -t -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

wait_for_advisory_lock() {
  local application_name="$1"
  local attempt
  local lock_count

  for attempt in $(seq 1 50); do
    lock_count="$(
      psql_admin -c "
        select count(*)
        from pg_catalog.pg_locks as l
        join pg_catalog.pg_stat_activity as a on a.pid = l.pid
        where a.application_name = '$application_name'
          and l.locktype = 'advisory'
          and l.granted
      "
    )"
    if [[ "$lock_count" = "1" ]]; then
      return 0
    fi
    sleep 0.1
  done

  echo "Timed out waiting for advisory lock held by $application_name" >&2
  return 1
}

psql_admin <<'SQL'
insert into auth.users (id, email)
values
  ('20000000-0000-0000-0000-000000000001', 'budget-concurrency@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'budget-settle-race@example.test');
SQL

first_reserve_out="$test_tmp/first-reserve.out"
first_reserve_err="$test_tmp/first-reserve.err"
second_reserve_out="$test_tmp/second-reserve.out"

docker exec -i -e PGAPPNAME=llm_budget_reserve_first "$db_container" \
  psql -X -A -t -U postgres -d postgres -v ON_ERROR_STOP=1 \
  >"$first_reserve_out" 2>"$first_reserve_err" <<'SQL' &
begin;
set local role service_role;
select
  case when allowed then 't' else 'f' end
  || ','
  || coalesce(reservation_id::text, '')
from public.reserve_llm_daily_budget(
  '20000000-0000-0000-0000-000000000001',
  'copilot',
  'openai',
  'gpt-concurrency',
  600,
  1000,
  300
);
select pg_catalog.pg_sleep(2);
commit;
SQL
background_pid="$!"

wait_for_advisory_lock "llm_budget_reserve_first"

docker exec -i -e PGAPPNAME=llm_budget_reserve_second "$db_container" \
  psql -X -A -t -U postgres -d postgres -v ON_ERROR_STOP=1 \
  >"$second_reserve_out" <<'SQL'
set role service_role;
select
  case when allowed then 't' else 'f' end
  || ','
  || coalesce(reservation_id::text, '')
from public.reserve_llm_daily_budget(
  '20000000-0000-0000-0000-000000000001',
  'copilot',
  'openai',
  'gpt-concurrency',
  600,
  1000,
  300
);
SQL

wait "$background_pid"
background_pid=""

first_result="$(grep -E '^[tf],' "$first_reserve_out")"
second_result="$(grep -E '^[tf],' "$second_reserve_out")"
reservation_count="$(
  psql_admin -c "
    select count(*)
    from public.llm_cost_reservations
    where user_id = '20000000-0000-0000-0000-000000000001'
  "
)"

if [[ "$first_result" != t,* || "$second_result" != "f," || "$reservation_count" != "1" ]]; then
  echo "Concurrent reservation assertion failed" >&2
  echo "first=$first_result second=$second_result rows=$reservation_count" >&2
  exit 1
fi

settle_reservation_id="$(
  psql_admin -c "
    select reservation_id
    from public.reserve_llm_daily_budget(
      '20000000-0000-0000-0000-000000000002',
      'copilot',
      'openai',
      'gpt-concurrency',
      600,
      1000,
      300
    )
  "
)"

psql_admin -c "
  set role service_role;
  select status
  from public.mark_llm_budget_incurred('$settle_reservation_id')
" >/dev/null

settle_out="$test_tmp/settle.out"
settle_err="$test_tmp/settle.err"
reserve_after_settle_out="$test_tmp/reserve-after-settle.out"

docker exec -i -e PGAPPNAME=llm_budget_settle_first "$db_container" \
  psql -X -A -t -U postgres -d postgres -v ON_ERROR_STOP=1 \
  >"$settle_out" 2>"$settle_err" <<SQL &
begin;
set local role service_role;
select status || ',' || settled_micrormb::text
from public.settle_llm_budget(
  '$settle_reservation_id',
  500
);
select pg_catalog.pg_sleep(2);
commit;
SQL
background_pid="$!"

wait_for_advisory_lock "llm_budget_settle_first"

docker exec -i -e PGAPPNAME=llm_budget_reserve_after_settle "$db_container" \
  psql -X -A -t -U postgres -d postgres -v ON_ERROR_STOP=1 \
  >"$reserve_after_settle_out" <<'SQL'
set role service_role;
select
  case when allowed then 't' else 'f' end
  || ','
  || coalesce(reservation_id::text, '')
from public.reserve_llm_daily_budget(
  '20000000-0000-0000-0000-000000000002',
  'copilot',
  'openai',
  'gpt-concurrency',
  500,
  1000,
  300
);
SQL

wait "$background_pid"
background_pid=""

settle_result="$(grep -E '^settled,' "$settle_out")"
reserve_after_settle_result="$(grep -E '^[tf],' "$reserve_after_settle_out")"
committed_total="$(
  psql_admin -c "
    select sum(
      case
        when status = 'settled' then settled_micrormb
        when status = 'incurred' then reserved_micrormb
        when status = 'reserved' and expires_at > now() then reserved_micrormb
        else 0
      end
    )
    from public.llm_cost_reservations
    where user_id = '20000000-0000-0000-0000-000000000002'
  "
)"

if [[ "$settle_result" != "settled,500" \
   || "$reserve_after_settle_result" != t,* \
   || "$committed_total" != "1000" ]]; then
  echo "Concurrent settle/reserve assertion failed" >&2
  echo "settle=$settle_result reserve=$reserve_after_settle_result total=$committed_total" >&2
  exit 1
fi

echo "PASS: concurrent reservations serialize to one winner"
echo "PASS: concurrent incurred settle/reserve remains within the daily cap"
