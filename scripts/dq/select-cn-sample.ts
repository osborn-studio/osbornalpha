// scripts/dq/select-cn-sample.ts
/**
 * A-share gold-set sample and transcription template (spec §5.4; owner decisions C, E, H).
 *
 *   node --env-file=.env.local --import tsx scripts/dq/select-cn-sample.ts [--count 30] [--out docs/audits/2026-11-05-data-foundation-3/cn-gold-template.json]
 *
 * tickers = the primary A-share ticker (plan 2 chooseCnTicker over the issuer's CURRENT issuer_securities rows) of
 * every fact_sync_scope row with market CN and priority > 0, ascending, the first min(count, N). The output is a
 * transcription TEMPLATE (gold-cn.ts goldTemplate): the exact tickers × FY2022–FY2025 × six-concept product with
 * every printed and source field '<pending>'. It fails validateGoldCn by design; recorder and reviewer fill it from
 * the cninfo annual-report PDFs (docs/runbooks/cn-gold-transcription.md) and only the completed, reviewed file is
 * committed as src/lib/dq/fixtures/gold/cn-annual-v1.json. The template holds tickers and primary-document locators
 * only — no selection reasons, no names (decision H).
 * N = 0 → nothing is written and exit 1 ("F3-6 cannot start": recorded, never faked). Exit 2 on bad arguments.
 */
import {writeFileSync} from 'node:fs';
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {isCurrentSecurity} from '../../src/lib/entities/resolve';
import {chooseCnTicker} from '../../src/lib/facts/scope';
import {goldTemplate,pickCnSample} from '../../src/lib/dq/reconcile/gold-cn';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: select-cn-sample.ts [--count <1..200>] [--out <path.json>]';

async function main(){
 const argv=process.argv.slice(2);let count=30;let out='docs/audits/2026-11-05-data-foundation-3/cn-gold-template.json';
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(k==='--count'&&v&&/^\d{1,3}$/.test(v)&&Number(v)>=1&&Number(v)<=200)count=Number(v);
  else if(k==='--out'&&v&&v.endsWith('.json'))out=v;
  else{console.error(USAGE);process.exit(2);}
 }
 const tables=supabaseTableClient(getAdminSupabase());const today=new Date().toISOString().slice(0,10);
 const scope=(await selectAll(tables,'fact_sync_scope',{market:'CN'},'issuer_id')).filter(r=>Number(r.priority)>0);
 const tickers:(string|null)[]=[];const unresolved:string[]=[];
 for(const s of scope){
  const secs=(await selectAll(tables,'issuer_securities',{issuer_id:String(s.issuer_id)},'ticker')).filter(r=>isCurrentSecurity(r,today));
  const c=chooseCnTicker(secs);
  if('ticker' in c)tickers.push(c.ticker);else{tickers.push(null);unresolved.push(`${String(s.issuer_id)}:${c.reason}`);}
 }
 const picked=pickCnSample(tickers,count);
 if(picked.length===0){console.error(JSON.stringify({scope:scope.length,picked:0,unresolved,message:'F3-6 cannot start: no CN issuer in scope (N = 0)'}));process.exit(1);}
 writeFileSync(out,`${JSON.stringify(goldTemplate(picked),null,1)}\n`);
 console.log(JSON.stringify({out,scope:scope.length,picked:picked.length,rows:picked.length*24,unresolved}));
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
