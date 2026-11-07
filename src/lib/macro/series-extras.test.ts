// Series detail extras (spec §3.3, §6): US policy events + cycles + same-region enabled assets; CN has no events.
import {describe,expect,it} from 'vitest';
import {catalogById} from './catalog';
import {MacroDbError,type MacroDb} from './db';
import {seriesExtras} from './series-extras';
import type {ObservationRow} from './types';
const obs=(id:string,d:string,v:string)=>({observation_id:id,period_end:d,value_text:v}) as unknown as ObservationRow;
const fake=(data:Record<string,ObservationRow[]>):Pick<MacroDb,'seriesHistory'>=>({seriesHistory:async(id:string)=>data[id]??[]});
describe('seriesExtras',()=>{
 it('catalog premises this task relies on',()=>{
  expect(catalogById('US_FED_TARGET_UPPER_D')?.role).toBe('event_source');
  expect(catalogById('US_FED_TARGET_LOWER_D')?.role).toBe('event_source');
  expect(catalogById('US_WTI')).toMatchObject({role:'asset',status:'active',changeKind:'pct',region:'US'});
  expect(catalogById('US_UST10Y')).toMatchObject({role:'asset',status:'active',changeKind:'bp',aliasOf:'US_DGS10'});
  expect(catalogById('CN_CGB10Y')).toMatchObject({role:'asset',status:'active',changeKind:'bp',aliasOf:'CN_CGB_10Y'});
  expect(catalogById('US_DFF')).toMatchObject({type:'policy_rate',period:'month'});
 });
 const us={
  US_FED_TARGET_UPPER_D:[obs('u1','2024-09-17','5.5'),obs('u2','2024-09-18','5'),obs('u3','2026-10-30','5')],
  US_FED_TARGET_LOWER_D:[obs('l1','2024-09-17','5.25'),obs('l2','2024-09-18','4.75'),obs('l3','2026-10-30','4.75')],
  US_WTI:[obs('w1','2024-09-30','68.17'),obs('w2','2026-09-30','70')],
  US_DGS10:[obs('g1','2024-09-30','3.81'),obs('g2','2026-09-30','4.1')],
 };
 it('US policy rate: derived events, policy cycles with plateau, asset moves to the last complete month',async()=>{
  const x=await seriesExtras(fake(us),catalogById('US_DFF')!,{});
  expect(x.events.map(e=>[e.effective_date,e.change_bp])).toEqual([['2024-09-18','-50']]);
  expect(x.cycles.map(c=>[c.direction,c.start,c.end,c.ongoing])).toEqual([['down','2024-09-18','2024-09-18',false],['plateau','2024-09-18','2026-10-30',true]]);
  const plateau=x.assetsByCycle.filter(a=>a.cycle_index===1);
  expect(plateau.map(a=>[a.asset_id,a.start_period,a.end_period,a.change_text,a.change_kind])).toEqual([
   ['US_WTI','2024-09-30','2026-09-30','2.6845','pct'],['US_UST10Y','2024-09-30','2026-09-30','29','bp']]);
  expect(x.calendar.length).toBeGreaterThan(0);
  expect(x.calendar.every(c=>Number.isFinite(Date.parse(c.retrieved_at)))).toBe(true);
  expect(x.eventsVersion).toBe('macro-events/1');expect(x.cyclesVersion).toBe('macro-cycles/1');
 });
 it('calendar follows asOf: empty before the first retrieval, populated after',async()=>{
  const before=await seriesExtras(fake(us),catalogById('US_DFF')!,{asOf:'2020-01-01T00:00:00.000Z'});
  expect(before.calendar).toEqual([]);
  const after=await seriesExtras(fake(us),catalogById('US_DFF')!,{asOf:'2099-01-01T00:00:00.000Z'});
  expect(after.calendar.length).toBeGreaterThan(0);
 });
 it('an asset view of the same series is not listed as its own asset',async()=>{
  const x=await seriesExtras(fake({...us,US_DGS10:Array.from({length:24},(_,i)=>obs(`d${i}`,new Date(Date.UTC(2020,i+1,0)).toISOString().slice(0,10),String(i)))}),catalogById('US_DGS10')!,{});
  expect(x.assetsByCycle.some(a=>a.asset_id==='US_UST10Y')).toBe(false);
  expect(x.cycles[0]).toMatchObject({basis:'trailing_median',direction:'up'});
 });
 it('CN: no events and no calendar; cycles from the series itself',async()=>{
  const pmi=Array.from({length:24},(_,i)=>obs(`p${i}`,new Date(Date.UTC(2020,i+1,0)).toISOString().slice(0,10),`${49+Math.floor(i/10)}.${i%10}`));
  const x=await seriesExtras(fake({CN_PMI_MFG:pmi}),catalogById('CN_PMI_MFG')!,{});
  expect(x.events).toEqual([]);expect(x.calendar).toEqual([]);
  expect(x.cycles).toHaveLength(1);
  expect(x.assetsByCycle.map(a=>[a.asset_id,a.change_text,a.missing])).toEqual([['CN_CGB10Y',null,'both']]);
 });
 it('a truncated history is an error, never a partial computation',async()=>{
  const db:Pick<MacroDb,'seriesHistory'>={seriesHistory:async()=>{throw new MacroDbError('truncated');}};
  await expect(seriesExtras(db,catalogById('US_DFF')!,{})).rejects.toMatchObject({code:'truncated'});
 });
});
