/**
 * Rebuild financial_metrics per issuer (spec §8 materialize).
 *
 *   node --env-file=.env.local --import tsx scripts/facts/materialize.ts --market US|CN (--issuer <ticker>... | --all)
 *
 * --all = every fact_sync_scope row of the market with priority > 0. Each issuer: read_facts
 * envelope → deriveMetrics → replace_financial_metrics under the envelope's state_rev (one retry on
 * stale_computation; truncated reads are refused). Prints one JSON line per issuer. Exit 1 if any
 * issuer failed, 2 on bad arguments.
 */
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {supabaseFactsDb} from '../../src/lib/facts/db';
import {materialize} from '../../src/lib/facts/derive';
import type {Market} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: materialize.ts --market US|CN (--issuer <ticker>... | --all)';

async function main(){
 const argv=process.argv.slice(2);let market:string|undefined,all=false;const tickers:string[]=[];
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--market'&&v){market=v;i++;}
  else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else if(x==='--all')all=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if((market!=='US'&&market!=='CN')||(all===(tickers.length>0))){console.error(USAGE);process.exit(2);}
 const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const db=supabaseFactsDb(sb);
 const today=new Date().toISOString().slice(0,10);
 let issuers:{issuerId:string;label:string}[];
 if(all){
  issuers=(await selectAll(tables,'fact_sync_scope',{market},'issuer_id')).filter(r=>Number(r.priority)>0).map(r=>({issuerId:String(r.issuer_id),label:String(r.fetch_key)}));
 }else{
  issuers=[];
  for(const t of tickers){
   const r=await resolveIssuer(tables,{ticker:t},{today});
   if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}
   issuers.push({issuerId:r.issuer_id,label:t});
  }
 }
 let failed=0;
 for(const {issuerId,label} of issuers){
  try{
   const r=await materialize(db,issuerId,market as Market,{today});
   console.log(JSON.stringify({issuer:issuerId,label,market,...r}));
  }catch(e){
   failed++;
   console.log(JSON.stringify({issuer:issuerId,label,market,error:e instanceof Error?e.message:String(e)}));
  }
 }
 console.log(JSON.stringify({issuers:issuers.length,failed}));
 process.exit(failed>0?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
