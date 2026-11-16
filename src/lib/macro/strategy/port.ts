// src/lib/macro/strategy/port.ts
// StrategyReadPort (spec §4.3): the only way the strategy module reads P1+P2 data. strategyPort() is the production
// port (WP-S6: macroDbStrategyPort over P1's supabaseMacroDb, wiring.ts); it is null only when the Supabase environment is
// not configured (capability matrix §9.1: enabled + null port → 503). memoryStrategyPort serves the unit tests from a
// StrategyFixture; its derivePolicyEvents / timeliness reproduce P2 events.ts derivePolicyEvents and P1 freshness.ts
// releaseTimeliness for tests only — production calls the P1/P2 functions directly.
// The port exposes service publish revisions for memo identity.
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import type {EventInput,MacroSeriesDef,ObservationRow,PolicyEvent,Region,RulesView,SnapshotRecord,Timeliness} from './contract';
import {macroRouteDeps} from '../route-helpers';
import type {StrategyFixture} from './testing/fixture';
import {macroDbStrategyPort} from './wiring';

export interface StrategyReadPort{
 activeSnapshot(region:Region):Promise<SnapshotRecord|null>;
 /** P1 macro_publish_state of the region (service read): revision bumps on every publish/republish, input_revision on every observation write; the memo key reads both. null when the row is missing. */
 publishState(region:Region):Promise<{revision:number;input_revision:number}|null>;
 snapshot(snapshotId:string):Promise<SnapshotRecord|null>;
 /** Newest non-failed snapshot with created_at ≤ cutoff; ties on created_at → greatest snapshot_id. Throws Error('truncated') if paging cannot finish. */
 snapshotUpTo(region:Region,cutoff:string):Promise<SnapshotRecord|null>;
 /** ok rows only, input order, unknown ids dropped. */
 observationsByIds(ids:string[]):Promise<ObservationRow[]>;
 /** Latest period per series with available_at ≤ asOf, highest such version. */
 latestObservations(seriesIds:string[],opts:{asOf:string}):Promise<ObservationRow[]>;
 /** Highest version per period with available_at ≤ asOf, ascending period_end; throws Error('truncated') beyond maxRows. */
 seriesHistory(seriesId:string,opts:{from?:string;to?:string;asOf:string;maxRows:number}):Promise<ObservationRow[]>;
 catalog():readonly MacroSeriesDef[];
 catalogVersion():string;
 rules():RulesView;
 derivePolicyEvents(upper:readonly EventInput[],lower:readonly EventInput[]):PolicyEvent[];
 timeliness(def:MacroSeriesDef,latestPeriodEnd:string|null,today:string):Timeliness;
}

/** Production port over P1's MacroDb (server-only: macroRouteDeps builds the service-role and anon clients, as every P1 route does).
 *  Null when the Supabase environment is missing, so the capability matrix answers 503 macro_foundation_unavailable (spec §9.1)
 *  instead of a 500. Callers invoke it after the session gate (middleware does not cover /api/*), or behind CRON_SECRET. */
export function strategyPort():StrategyReadPort|null{
 try{return macroDbStrategyPort(macroRouteDeps().db);}
 catch{return null;}
}

// ---------------------------------------------------------------- memory port (tests)
const ms=(t:string)=>{const v=Date.parse(t);if(!Number.isFinite(v))throw new Error(`invalid_timestamp:${t}`);return v;};
/** Exact a − b on decimal text (BigInt scaled, no float), canonical. */
function subtract(a:string,b:string):string{
 const parse=(x:string)=>{const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(canonicalDecimal(x));if(!m)throw new Error(`invalid_decimal:${x}`);return {neg:m[1]==='-',digits:m[2]+(m[3]??''),scale:(m[3]??'').length};};
 const pa=parse(a),pb=parse(b);const s=Math.max(pa.scale,pb.scale);
 const big=(p:{neg:boolean;digits:string;scale:number})=>{const n=BigInt(p.digits)*10n**BigInt(s-p.scale);return p.neg?-n:n;};
 const d=big(pa)-big(pb);const neg=d<0n;let digits=(neg?-d:d).toString();
 if(s>0){digits=digits.padStart(s+1,'0');digits=`${digits.slice(0,-s)}.${digits.slice(-s)}`;}
 return canonicalDecimal(`${neg?'-':''}${digits}`);
}
/** P2 toBp: exact decimal × 100 (percentage points → basis points). */
const toBp=(delta:string):string=>canonicalDecimal(`${canonicalDecimal(delta)}e2`);
function assertAscending(rows:readonly EventInput[],label:string){
 for(let i=1;i<rows.length;i++)if(rows[i].period_end<=rows[i-1].period_end)throw new Error(`events_unsorted:${label}:${rows[i].period_end}`);
}
/** P2 derivePolicyEvents semantics (macro-events/1): joint days where both bounds exist; a change of either bound → one
 *  event at the later day; change_bp from the upper bound unless only the lower bound moved. */
function memoryDerivePolicyEvents(upper:readonly EventInput[],lower:readonly EventInput[]):PolicyEvent[]{
 assertAscending(upper,'upper');assertAscending(lower,'lower');
 const lowerBy=new Map(lower.map(r=>[r.period_end,r]));
 const days=upper.filter(u=>lowerBy.has(u.period_end)).map(u=>({u,l:lowerBy.get(u.period_end)!}));
 const out:PolicyEvent[]=[];
 for(let i=1;i<days.length;i++){
  const p=days[i-1],c=days[i];
  const du=subtract(c.u.value_text,p.u.value_text),dl=subtract(c.l.value_text,p.l.value_text);
  if(du==='0'&&dl==='0')continue;
  out.push({kind:'policy_target_change',region:'US',effective_date:c.u.period_end,
   upper_from:canonicalDecimal(p.u.value_text),upper_to:canonicalDecimal(c.u.value_text),lower_from:canonicalDecimal(p.l.value_text),lower_to:canonicalDecimal(c.l.value_text),
   change_bp:toBp(du!=='0'?du:dl),source:'derived',
   evidence:[p.u.observation_id,c.u.observation_id,p.l.observation_id,c.l.observation_id],version:'macro-events/1'});
 }
 return out;
}
const DAY=86400000,GRACE_DAYS=3;
const ISO_DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Strict like P1 freshness.ts parseDate: shape, then a round trip so impossible dates (2026-02-31) throw invalid_date. */
const dateMs=(d:string)=>{
 if(!ISO_DATE.test(d))throw new Error(`invalid_date:${d}`);
 const t=Date.parse(`${d}T00:00:00Z`);
 if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==d)throw new Error(`invalid_date:${d}`);
 return t;
};
function nextPeriodEnd(period:MacroSeriesDef['period'],periodEnd:string):string{
 const t=dateMs(periodEnd);   // validates every period, not only 'day'
 if(period==='day')return new Date(t+DAY).toISOString().slice(0,10);
 const idx=Number(periodEnd.slice(0,4))*12+Number(periodEnd.slice(5,7))-1+(period==='month'?1:3);
 return new Date(Date.UTC(Math.floor(idx/12),idx%12+1,0)).toISOString().slice(0,10);
}
/** P1 releaseTimeliness: next period end + releaseLagDays + 3 days grace < today → late. */
function memoryTimeliness(def:MacroSeriesDef,latestPeriodEnd:string|null,today:string):Timeliness{
 if(def.nativeFrequency==='event'||def.releaseLagDays===undefined)return 'n/a';
 if(latestPeriodEnd===null)return 'missing';
 return dateMs(today)>dateMs(nextPeriodEnd(def.period,latestPeriodEnd))+(def.releaseLagDays+GRACE_DAYS)*DAY?'late':'current';
}
const newest=(a:SnapshotRecord,b:SnapshotRecord)=>{const d=ms(b.created_at)-ms(a.created_at);return d!==0?d:a.snapshot_id<b.snapshot_id?1:a.snapshot_id>b.snapshot_id?-1:0;};
/** Visible ok versions of one series at asOf, highest version per period_end, ascending period_end. */
function visible(f:StrategyFixture,seriesId:string,asOf:string):ObservationRow[]{
 const cut=ms(asOf);const best=new Map<string,ObservationRow>();
 for(const o of f.observations){
  if(o.series_id!==seriesId||o.status!=='ok'||ms(o.available_at)>cut)continue;
  const cur=best.get(o.period_end);if(!cur||o.version>cur.version)best.set(o.period_end,o);
 }
 return [...best.values()].sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:0);
}
export function memoryStrategyPort(f:StrategyFixture):StrategyReadPort{
 const byId=new Map(f.observations.map(o=>[o.observation_id,o]));
 return {
  async activeSnapshot(region){return f.snapshots.filter(s=>s.region===region&&s.status==='active').sort(newest)[0]??null;},
  async publishState(region){return f.publishState?.[region]??null;},
  async snapshot(id){return f.snapshots.find(s=>s.snapshot_id===id)??null;},
  async snapshotUpTo(region,cutoff){const c=ms(cutoff);return f.snapshots.filter(s=>s.region===region&&s.status!=='failed'&&ms(s.created_at)<=c).sort(newest)[0]??null;},
  async observationsByIds(ids){return ids.map(id=>byId.get(id)).filter((o):o is ObservationRow=>!!o&&o.status==='ok');},
  async latestObservations(seriesIds,{asOf}){return seriesIds.flatMap(id=>{const v=visible(f,id,asOf);return v.length?[v[v.length-1]]:[];});},
  async seriesHistory(seriesId,{from,to,asOf,maxRows}){
   const rows=visible(f,seriesId,asOf).filter(o=>(from===undefined||o.period_end>=from)&&(to===undefined||o.period_end<=to));
   if(rows.length>maxRows)throw new Error('truncated');
   return rows;
  },
  catalog:()=>f.catalog,
  catalogVersion:()=>f.catalogVersion,
  rules:()=>f.rules,
  derivePolicyEvents:memoryDerivePolicyEvents,
  timeliness:memoryTimeliness,
 };
}
