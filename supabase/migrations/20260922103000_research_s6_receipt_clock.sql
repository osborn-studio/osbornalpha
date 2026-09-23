-- Receipt timestamps are DB facts, including for direct runtime INSERTs.
create function public.research_s6_receipt_clock() returns trigger language plpgsql as $$
begin
 if tg_table_name='research_s6_markets' then new.fetched_at=clock_timestamp();
 else new.created_at=clock_timestamp(); end if;
 return new;
end $$;
create trigger research_s6_market_clock before insert on public.research_s6_markets
 for each row execute function public.research_s6_receipt_clock();
create trigger research_s6_evaluation_clock before insert on public.research_s6_evaluations
 for each row execute function public.research_s6_receipt_clock();
