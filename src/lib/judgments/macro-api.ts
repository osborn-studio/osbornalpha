// src/lib/judgments/macro-api.ts
// The macro workbench read interface F4 programs against (spec §12.1; contract MacroReadApi). The
// workbench (macro_observations / macro_snapshots / regime.ts) is not in the repository yet, so F4
// ships two implementations: fixtureMacroReadApi(fixture) for tests, replay fixtures and the
// macro_regime@v2 producer (Task 19), and unavailableMacroReadApi() for production wiring until the
// workbench lands (every call rejects with MacroUnavailable → settle Unavailable(macro_unavailable);
// the compensation scan skips with info code macro_unavailable — plan conventions).
// classifyAsOf over a fixture returns the fixture's precomputed classification for (region,
// reference period, macro methodology version) with the largest visible_from ≤ cutoff: it stands in
// for "the same regime.ts function over the latest vintages with available_at ≤ cutoff"; the
// validator refuses a classification that uses an observation before its available_at.
// Observation ids are F4's composite observationIdOf(ref) (plan Part B deviation 2).
import type {MacroObservationRef,MacroReadApi,MacroSnapshotRow,Regime,RegimeResult} from './types';

export class MacroUnavailable extends Error{constructor(public readonly reason:string){super(`macro_unavailable:${reason}`);this.name='MacroUnavailable';}}
export const observationIdOf=(r:{series_id:string;period_end:string;vintage_id:string})=>`${encodeURIComponent(r.series_id)}:${r.period_end}:${encodeURIComponent(r.vintage_id)}`;
export interface MacroFixtureObservation extends MacroObservationRef{observation_id:string}
export interface MacroFixtureClassification{region:'US'|'CN';reference_period:string;macro_methodology_version:string;visible_from:string;regime:RegimeResult|null;observation_ids:string[];catalog:{version:string;weights:Record<string,number>;rules_version:string}}
export interface MacroFixture{fixture_version:'macro-fixture/1';observations:MacroFixtureObservation[];snapshots:MacroSnapshotRow[];series_catalog:{US?:Record<string,unknown>[];CN?:Record<string,unknown>[]};classifications:MacroFixtureClassification[]}

const REGIMES:readonly Regime[]=['recovery','overheat','stagflation','recession'];
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const bad=(why:string):never=>{throw new Error(`macro_fixture_invalid:${why}`);};
const ms=(s:string)=>Date.parse(s);
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
function checkRegime(r:RegimeResult|null,where:string):void{
 if(r===null)return;
 if(!REGIMES.includes(r.primary_state))bad(`${where}.primary_state`);
 if(r.secondary_state!==null&&!REGIMES.includes(r.secondary_state))bad(`${where}.secondary_state`);
 for(const k of REGIMES)if(typeof r.scores?.[k]!=='number'||typeof r.norm?.[k]!=='number')bad(`${where}.scores/norm.${k}`);
 if(typeof r.coverage!=='number'||typeof r.margin_pp!=='number')bad(`${where}.coverage/margin_pp`);
}
/** Structural validation; returns the fixture typed or throws Error('macro_fixture_invalid:<where>'). */
export function validateMacroFixture(raw:unknown):MacroFixture{
 const fx=raw as MacroFixture;
 if(!fx||typeof fx!=='object'||fx.fixture_version!=='macro-fixture/1')bad('fixture_version');
 if(!Array.isArray(fx.observations)||!Array.isArray(fx.snapshots)||!Array.isArray(fx.classifications)||!fx.series_catalog||typeof fx.series_catalog!=='object')bad('shape');
 const obs=new Map<string,MacroFixtureObservation>();
 for(const o of fx.observations){
  if(o.observation_id!==observationIdOf(o))bad(`observation_id ${o.observation_id}`);
  if(obs.has(o.observation_id))bad(`duplicate observation ${o.observation_id}`);
  if(!ISO.test(o.available_at)||typeof o.value!=='number'||!Number.isFinite(o.value)||typeof o.unit!=='string')bad(`observation ${o.observation_id}`);
  obs.set(o.observation_id,o);
 }
 const snaps=new Set<string>();
 for(const s of fx.snapshots){
  if(snaps.has(s.snapshot_id))bad(`duplicate snapshot ${s.snapshot_id}`);snaps.add(s.snapshot_id);
  if(!['active','superseded','failed'].includes(s.status)||!ISO.test(s.created_at)||!/^\d{4}-\d{2}-\d{2}$/.test(s.as_of)||(s.region!=='US'&&s.region!=='CN'))bad(`snapshot ${s.snapshot_id}`);
  for(const id of s.observation_ids)if(!obs.has(id))bad(`snapshot ${s.snapshot_id} observation ${id}`);
  checkRegime(s.regime,`snapshot ${s.snapshot_id}`);
 }
 const keys=new Set<string>();
 for(const c of fx.classifications){
  const k=`${c.region}|${c.reference_period}|${c.macro_methodology_version}|${c.visible_from}`;
  if(keys.has(k))bad(`duplicate classification ${k}`);keys.add(k);
  if(!ISO.test(c.visible_from)||!/^\d{4}-\d{2}$/.test(c.reference_period))bad(`classification ${k}`);
  for(const id of c.observation_ids){
   const o=obs.get(id);
   if(!o)bad(`classification ${k} observation ${id}`);
   else if(ms(o.available_at)>ms(c.visible_from))bad(`classification ${k} uses ${id} before it is available`);
  }
  checkRegime(c.regime,`classification ${k}`);
 }
 return fx;
}
const refOf=(o:MacroFixtureObservation):MacroObservationRef=>({series_id:o.series_id,period_end:o.period_end,vintage_id:o.vintage_id,value:o.value,unit:o.unit,available_at:o.available_at});
export function fixtureMacroReadApi(fixture:MacroFixture):MacroReadApi{
 const fx=validateMacroFixture(structuredClone(fixture));
 const obs=new Map(fx.observations.map(o=>[o.observation_id,o] as const));
 const ordered=[...fx.snapshots].sort((a,b)=>ms(a.created_at)-ms(b.created_at)||cmp(a.snapshot_id,b.snapshot_id));
 return {
  async observation(id){const o=obs.get(id);return o?refOf(o):null;},
  async snapshot(id){const s=fx.snapshots.find(x=>x.snapshot_id===id);return s?structuredClone(s):null;},
  async snapshotsSince(marker,limit){
   const after=(s:MacroSnapshotRow)=>marker===null||ms(s.created_at)>ms(marker.created_at)||(ms(s.created_at)===ms(marker.created_at)&&s.snapshot_id>marker.snapshot_id);
   return ordered.filter(s=>s.status!=='failed'&&after(s)).slice(0,Math.max(0,limit)).map(s=>structuredClone(s));
  },
  async seriesCatalog(region){return structuredClone(fx.series_catalog[region]??[]);},
  async classifyAsOf(region,referencePeriod,cutoff,version){
   const at=ms(cutoff);if(!Number.isFinite(at))throw new RangeError(`cutoff ${cutoff}`);
   const hits=fx.classifications.filter(c=>c.region===region&&c.reference_period===referencePeriod&&c.macro_methodology_version===version&&ms(c.visible_from)<=at).sort((a,b)=>ms(b.visible_from)-ms(a.visible_from));
   const c=hits[0];
   if(!c)throw new MacroUnavailable(`no_classification:${region}:${referencePeriod}:${version}@${cutoff}`);
   return {regime:structuredClone(c.regime),observation_refs:c.observation_ids.map(id=>refOf(obs.get(id)!)),catalog:structuredClone(c.catalog)};
  },
 };
}
export function unavailableMacroReadApi(reason='macro_workbench_absent'):MacroReadApi{
 const fail=async():Promise<never>=>{throw new MacroUnavailable(reason);};
 return {observation:fail,snapshot:fail,snapshotsSince:fail,seriesCatalog:fail,classifyAsOf:fail};
}
