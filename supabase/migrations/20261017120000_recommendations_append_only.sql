-- public.recommendations is append-only at the database level.
-- Until now the rule lived only in the API (create + withdraw, one-shot fill by the scorer);
-- the "own update" RLS policy still let any client holding the owner's JWT rewrite any column
-- (recommended_at, reference_price, fill_price, ...) and forge its own track record.
-- This BEFORE UPDATE trigger closes that path for every role, superuser included:
--   * withdrawn_at may go null -> not null once; withdraw_reason may be set in that same update.
--     A row that is already withdrawn rejects every change.
--   * fill_price and fill_date may go null -> not null together, once (the table check already
--     pairs them). A row that already has a fill rejects any change to either column.
--   * Every other column is immutable; the error names the offending column(s).
-- Comparisons use IS DISTINCT FROM so null <-> null is "unchanged" and null <-> value is a change.
-- Error code stays the plpgsql default P0001 (raise_exception); messages start with
-- 'recommendations are append-only' so callers can recognise them.
-- Edge case accepted: the scorer only fills rows that were not withdrawn when it read them, so a
-- withdraw that lands between its read and its fill write makes that one refresh fail; retry.
-- Covered by src/lib/analyst/recommendations-append-only.integration.test.ts (npm run test:db).
-- Manual check against a local cluster (LC_ALL=C npx tsx scripts/s4/local-db.ts, then psql adminUrl):
--   update public.recommendations set reference_price = 1 where id = ...;      -- ERROR, names reference_price
--   update public.recommendations set withdrawn_at = now() where id = ...;     -- ok once, then ERROR
--   update public.recommendations set fill_price = 10, fill_date = current_date where id = ...; -- ok once, then ERROR

create or replace function public.recommendations_append_only() returns trigger as $$
declare
  changed text[] := array[]::text[];
begin
  -- 1. Immutable columns.
  if new.id              is distinct from old.id              then changed := array_append(changed, 'id'); end if;
  if new.user_id         is distinct from old.user_id         then changed := array_append(changed, 'user_id'); end if;
  if new.analyst_id      is distinct from old.analyst_id      then changed := array_append(changed, 'analyst_id'); end if;
  if new.ticker          is distinct from old.ticker          then changed := array_append(changed, 'ticker'); end if;
  if new.market          is distinct from old.market          then changed := array_append(changed, 'market'); end if;
  if new.action          is distinct from old.action          then changed := array_append(changed, 'action'); end if;
  if new.reference_price is distinct from old.reference_price then changed := array_append(changed, 'reference_price'); end if;
  if new.rationale       is distinct from old.rationale       then changed := array_append(changed, 'rationale'); end if;
  if new.confidence      is distinct from old.confidence      then changed := array_append(changed, 'confidence'); end if;
  if new.target_price    is distinct from old.target_price    then changed := array_append(changed, 'target_price'); end if;
  if new.stop_loss       is distinct from old.stop_loss       then changed := array_append(changed, 'stop_loss'); end if;
  if new.horizon         is distinct from old.horizon         then changed := array_append(changed, 'horizon'); end if;
  if new.thesis_ref      is distinct from old.thesis_ref      then changed := array_append(changed, 'thesis_ref'); end if;
  if new.source_type     is distinct from old.source_type     then changed := array_append(changed, 'source_type'); end if;
  if new.source_ref      is distinct from old.source_ref      then changed := array_append(changed, 'source_ref'); end if;
  if new.recommended_at  is distinct from old.recommended_at  then changed := array_append(changed, 'recommended_at'); end if;
  if new.created_at      is distinct from old.created_at      then changed := array_append(changed, 'created_at'); end if;
  if cardinality(changed) > 0 then
    raise exception 'recommendations are append-only: cannot change %', array_to_string(changed, ', ');
  end if;

  -- 2. Withdrawal: one-shot null -> not null; a withdrawn row is frozen.
  if old.withdrawn_at is not null then
    if new.withdrawn_at is distinct from old.withdrawn_at
       or new.withdraw_reason is distinct from old.withdraw_reason
       or new.fill_price is distinct from old.fill_price
       or new.fill_date is distinct from old.fill_date then
      raise exception 'recommendations are append-only: row is withdrawn and cannot change';
    end if;
  elsif new.withdrawn_at is null and new.withdraw_reason is distinct from old.withdraw_reason then
    raise exception 'recommendations are append-only: cannot change withdraw_reason without withdrawing';
  end if;

  -- 3. Fill: one-shot null -> not null for both columns together; never rewritten.
  if new.fill_price is distinct from old.fill_price or new.fill_date is distinct from old.fill_date then
    if old.fill_price is not null or old.fill_date is not null then
      raise exception 'recommendations are append-only: cannot change fill_price, fill_date once filled';
    end if;
    if new.fill_price is null or new.fill_date is null then
      raise exception 'recommendations are append-only: fill_price, fill_date must be written together';
    end if;
  end if;

  return new;
end; $$ language plpgsql;

create trigger recommendations_append_only before update on public.recommendations
  for each row execute function public.recommendations_append_only();
