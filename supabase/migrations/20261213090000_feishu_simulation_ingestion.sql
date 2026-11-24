-- Opt-in bridge for the Feishu simulation. Ordinary users cannot create receipts or invoke the import.
create table public.feishu_simulation_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  recommendation_id uuid not null,
  decision_id uuid,
  trade_id uuid unique,
  event_order bigint generated always as identity,
  primary key (owner_id, source_id),
  check ((decision_id is null) = (trade_id is null))
);

alter table public.feishu_simulation_receipts enable row level security;
revoke all on public.feishu_simulation_receipts from public, anon, authenticated;
grant select, insert on public.feishu_simulation_receipts to service_role;
grant usage on sequence public.feishu_simulation_receipts_event_order_seq to service_role;

create function public.ingest_feishu_simulation(
  p_owner uuid, p_analyst uuid, p_source_id text, p_payload_hash text, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  prior public.feishu_simulation_receipts%rowtype;
  advice jsonb := p_payload->'recommendation';
  fill jsonb := p_payload->'execution';
  has_execution boolean := coalesce(fill <> 'null'::jsonb, false);
  symbol text := advice->>'ticker';
  market text := advice->>'market';
  action text := advice->>'action';
  recommended_at timestamptz := (advice->>'recommended_at')::timestamptz;
  direction text := case when action in ('buy','add') then 'buy' when action in ('sell','trim') then 'sell' end;
  currency text := case market when 'A' then 'CNY' when 'HK' then 'HKD' when 'US' then 'USD' end;
  reference jsonb := jsonb_strip_nulls(jsonb_build_object('integration', 'feishu_simulation', 'source_id', p_source_id,
    'requested_horizon', p_payload->>'requestedHorizon'));
  recommendation_id uuid;
  decision_id uuid;
  trade_id uuid;
  row_fill record;
  shares numeric := 0;
  avg_cost numeric := 0;
  realized_pnl numeric := 0;
  opened_at timestamptz;
  closed_at timestamptz;
begin
  -- Claim the event before looking at the current analyst/profile or portfolio. The committed
  -- receipt remains authoritative after configuration changes and subsequent manual trades.
  perform pg_advisory_xact_lock(hashtextextended('feishu_simulation:' || p_owner || ':' || p_source_id, 0));
  select * into prior from public.feishu_simulation_receipts r
    where r.owner_id = p_owner and r.source_id = p_source_id;
  if found then
    if prior.payload_hash <> p_payload_hash then raise exception 'payload_conflict' using errcode = 'P0409'; end if;
    return jsonb_build_object('recommendationId', prior.recommendation_id, 'decisionId', prior.decision_id,
      'tradeId', prior.trade_id, 'replayed', true);
  end if;

  perform 1 from public.analyst_profiles a
    where a.user_id = p_owner and a.id = p_analyst and a.archived_at is null for share;
  if not found then raise exception 'analyst_unavailable' using errcode = 'P0403'; end if;
  if not coalesce(action in ('buy','add','sell','trim','hold','pass'), false) or currency is null or
      (has_execution and (direction is null or jsonb_typeof(fill) is distinct from 'object')) then
    raise exception 'invalid_simulation' using errcode = '22023';
  end if;

  insert into public.recommendations(user_id, analyst_id, ticker, market, action, reference_price, rationale,
      confidence, target_price, stop_loss, horizon, thesis_ref, source_type, source_ref, recommended_at)
    values(p_owner, p_analyst, symbol, market, action, (advice->>'reference_price')::numeric, advice->>'rationale',
      (advice->>'confidence')::integer, (advice->>'target_price')::numeric, (advice->>'stop_loss')::numeric,
      advice->>'horizon', advice->>'thesis_ref', 'import', reference, recommended_at)
    returning id into recommendation_id;

  if has_execution then
    -- Serialize imports for this simulated portfolio and symbol. Use a dedicated simulated
    -- account: the legacy manual API does not take this lock across its separate requests.
    perform pg_advisory_xact_lock(hashtextextended('feishu_simulation_position:' || p_owner || ':' || symbol, 0));
    insert into public.decisions(user_id, ticker, market, action, thesis, confidence, target_price, stop_loss,
        horizon, source_type, source_ref, status, decided_at, recommendation_id)
      values(p_owner, symbol, market, action, advice->>'rationale', (advice->>'confidence')::integer,
        (advice->>'target_price')::numeric, (advice->>'stop_loss')::numeric, advice->>'horizon',
        'manual', reference, 'executed', (p_payload->>'approvedAt')::timestamptz, recommendation_id)
      returning id into decision_id;
    insert into public.trades(user_id, decision_id, ticker, direction, price, quantity, fee, currency, executed_at, note)
      values(p_owner, decision_id, symbol, direction, (fill->>'price')::numeric, (fill->>'quantity')::numeric,
        (fill->>'fee')::numeric, currency, (fill->>'executed_at')::timestamptz, fill->>'note')
      returning id into trade_id;
  end if;

  insert into public.feishu_simulation_receipts(owner_id, source_id, payload_hash, recommendation_id, decision_id, trade_id)
    values(p_owner, p_source_id, p_payload_hash, recommendation_id, decision_id, trade_id);

  if trade_id is not null then
    -- Mirror computePositions using numeric arithmetic inside the same commit. Review the
    -- full time-ordered history so a backdated sell cannot make any later position negative.
    for row_fill in
      select t.* from public.trades t left join public.feishu_simulation_receipts r on r.trade_id = t.id
        where t.user_id = p_owner and t.ticker = symbol
        order by t.executed_at, r.event_order nulls first, t.id
    loop
      if row_fill.currency <> currency then raise exception 'currency_conflict' using errcode = 'P0409'; end if;
      if row_fill.direction = 'buy' then
        if shares = 0 then
          opened_at := row_fill.executed_at;
          closed_at := null;
        end if;
        avg_cost := (shares * avg_cost + row_fill.quantity * row_fill.price + row_fill.fee) / (shares + row_fill.quantity);
        shares := shares + row_fill.quantity;
      else
        if row_fill.quantity > shares then raise exception 'oversell' using errcode = 'P0409'; end if;
        realized_pnl := realized_pnl + (row_fill.price - avg_cost) * row_fill.quantity - row_fill.fee;
        shares := shares - row_fill.quantity;
        if shares = 0 then closed_at := row_fill.executed_at; end if;
      end if;
    end loop;

    insert into public.positions(user_id, ticker, shares, avg_cost, realized_pnl, currency, opened_at, closed_at)
      values(p_owner, symbol, shares, case when shares > 0 then avg_cost else 0 end, realized_pnl, currency, opened_at, closed_at)
      on conflict on constraint positions_pkey do update set shares = excluded.shares, avg_cost = excluded.avg_cost,
        realized_pnl = excluded.realized_pnl, currency = excluded.currency,
        opened_at = excluded.opened_at, closed_at = excluded.closed_at;
  end if;

  return jsonb_build_object('recommendationId', recommendation_id, 'decisionId', decision_id, 'tradeId', trade_id, 'replayed', false);
end;
$$;

revoke all on function public.ingest_feishu_simulation(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_feishu_simulation(uuid, uuid, text, text, jsonb) to service_role;
