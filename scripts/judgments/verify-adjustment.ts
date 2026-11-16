/**
 * Adjustment capability verification (spec §7.4, F4-2).
 *
 *   node --env-file=.env.local --import tsx scripts/judgments/verify-adjustment.ts [--source eastmoney|datagateway] [--dry-run]
 *
 * For each (source, ADJUST_EVENTS entry): records qfq / hfq / none daily bars for [ex_date − 30 d,
 * ex_date + 30 d] through the adapters' F4 endDate options, judges qfq and hfq against the announced
 * action (adjustment-verify.ts), and writes fixtures/judgments/kline/<source>-<market>-<ticker>-<ex_date>.json
 * only when all three series were fetched (--dry-run writes nothing). Prints one JSON line per
 * (source, market, adjustment) with the verdict and the PRICE_CAPABILITIES row to commit. A fetch
 * failure prints status network_unavailable, a missing DataGateway configuration not_configured;
 * neither writes anything (degraded path: the table stays 'unverified'). Exit 0; 2 on bad arguments.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {fetchDatagatewayDailyKline,isDatagatewayConfigured} from '../../src/lib/data/sources/datagateway';
import {fetchEastmoneyKline} from '../../src/lib/data/sources/eastmoney';
import {ADJUST_EVENTS,capabilityStatusOf,fixturePathOf,judgeFixture} from '../../src/lib/judgments/adjustment-verify';
import type {AdjustEventSpec,KlineAdjustFixture,SeriesRecord} from '../../src/lib/judgments/adjustment-verify';
import {addDaysIso} from '../../src/lib/judgments/time';

type Source='eastmoney'|'datagateway';
const USAGE='usage: verify-adjustment.ts [--source eastmoney|datagateway] [--dry-run]';
const out=(o:Record<string,unknown>)=>console.log(JSON.stringify(o));
async function fetchSeries(source:Source,spec:AdjustEventSpec,adjustment:'qfq'|'hfq'|'none',from:string,to:string):Promise<SeriesRecord>{
 let closeOnly=false;
 const s=source==='eastmoney'
  ?await fetchEastmoneyKline(spec.ticker,'D',60,{adjustment,endDate:addDaysIso(to,1),timeoutMs:10_000})
  :await fetchDatagatewayDailyKline(spec.ticker,spec.market,60,adjustment,{startDate:from,endDate:to,timeoutMs:15_000,onCloseOnly:()=>{closeOnly=true;}});
 if(!s)throw new Error(`${source} returned no series for ${spec.ticker} ${adjustment}`);
 const bars=s.bars.filter(b=>b.time>=from&&b.time<=to).sort((a,b)=>a.time<b.time?-1:1);
 if(bars.length===0)throw new Error(`${source} returned no bars in [${from}, ${to}] for ${spec.ticker} ${adjustment}`);
 return {adjustment,close_only:closeOnly,bars};
}
async function main(){
 const argv=process.argv.slice(2);let only:Source|undefined;let dryRun=false;
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--source'&&(v==='eastmoney'||v==='datagateway')){only=v;i++;}
  else if(x==='--dry-run')dryRun=true;
  else{console.error(USAGE);process.exit(2);}
 }
 const sources:Source[]=only?[only]:['eastmoney','datagateway'];
 for(const source of sources)for(const spec of ADJUST_EVENTS){
  const base={source,market:spec.market,ticker:spec.ticker,ex_date:spec.event.ex_date};
  if(source==='datagateway'&&!isDatagatewayConfigured()){out({...base,status:'not_configured'});continue;}
  const from=addDaysIso(spec.event.ex_date,-30),to=addDaysIso(spec.event.ex_date,30);
  let series:KlineAdjustFixture['series'];
  try{series={qfq:await fetchSeries(source,spec,'qfq',from,to),hfq:await fetchSeries(source,spec,'hfq',from,to),none:await fetchSeries(source,spec,'none',from,to)};}
  catch(e){out({...base,status:'network_unavailable',message:e instanceof Error?e.message:String(e)});continue;}
  const recordedAt=new Date().toISOString();
  const fx:KlineAdjustFixture={fixture_version:'kline-adjust/1',source,market:spec.market,ticker:spec.ticker,event:spec.event,window:{from,to},recorded_at:recordedAt,series,verdicts:judgeFixture({event:spec.event,series})};
  const path=fixturePathOf(source,spec.market,spec.ticker,spec.event.ex_date);
  if(!dryRun){mkdirSync('fixtures/judgments/kline',{recursive:true});writeFileSync(path,`${JSON.stringify(fx,null,1)}\n`);}
  for(const adj of ['qfq','hfq'] as const){
   const status=capabilityStatusOf(fx.verdicts[adj]);
   const row=status==='unverified'?`cap('${source}','${spec.market}','${adj}')`:`cap('${source}','${spec.market}','${adj}','${status}','${path}','${recordedAt.slice(0,10)}')`;
   out({...base,adjustment:adj,status,verdict:fx.verdicts[adj],fixture:dryRun?null:path,capability_row:row});
  }
 }
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
