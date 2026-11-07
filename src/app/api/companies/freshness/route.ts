// src/app/api/companies/freshness/route.ts
// Dataset freshness for the company pages (spec §6.1): dq_freshness is service_role only, so the server
// reads it with the service client, recomputes status at `now` (freshnessOf — a stopped producer turns
// stale), and returns ONLY {dataset, status, lastOkAt, lastAttemptAt} for the three datasets.
import {NextResponse} from 'next/server';
import {productionReadDeps} from '@/lib/company/deps';
import {freshnessOf} from '@/lib/dq/freshness';
import {failureResponse} from '@/lib/facts/public-route';

export const dynamic='force-dynamic';
const DATASETS=['facts.us','facts.cn','company.events'] as const;
export async function GET(){
 try{
  const rows=await freshnessOf(productionReadDeps().freshnessTables(),new Date());
  const by=new Map(rows.map(r=>[String(r.dataset),r]));
  const datasets=DATASETS.map(d=>{const r=by.get(d);return {dataset:d,status:r?r.status:'missing',lastOkAt:(r?.last_ok_at as string|null|undefined)??null,lastAttemptAt:(r?.last_attempt_at as string|null|undefined)??null};});
  return NextResponse.json({datasets},{headers:{'Cache-Control':'public, max-age=60'}});
 }catch(e){return failureResponse(e,'companies/freshness','freshness read failed');}
}
