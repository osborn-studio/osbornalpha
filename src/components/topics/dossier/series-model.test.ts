// Topic spec §7.2, A17: repeated series preserve gaps and table rows.
import {describe,expect,it} from 'vitest';
import {lineSegments} from '@/components/research-ui';
import type {PublicEvidence} from '@/lib/topics/public-dto';
import {seriesModel} from './series-model';
const row=(ordinal:number,patch:Partial<PublicEvidence>={}):PublicEvidence=>({ordinal,section_key:'s',kind:'macro_observation',state:'ok',reason:null,basis:'point_in_time',label:{zh:'利率',en:'Rate'},fact:{template:'topic.macro_level',slots:{series:'RATE',value:{value_text:String(ordinal),unit:'pct'}}},period:`2026-0${ordinal}-01`,available_at:null,drift:null,masked:false,current:null,...patch});
describe('repeated series',()=>{
 it('splits three ok points at one withheld point and keeps every table row',()=>{
  const rows=[row(1),row(2,{state:'withheld',fact:null}),row(3),row(4)];
  const m=seriesModel(rows)!;
  expect(m.series).toBe('RATE');expect(m.points).toEqual([{x:'2026-01-01',y:1},{x:'2026-02-01',y:null},{x:'2026-03-01',y:3},{x:'2026-04-01',y:4}]);
  expect(lineSegments(m.points)).toEqual([[m.points[0]],[m.points[2],m.points[3]]]);expect(m.tableRows).toEqual(rows);expect(m.tableRows).toHaveLength(4);
 });
 it('keeps other section evidence in the table equivalent',()=>{const rows=[row(1),row(2),row(3,{kind:'financial_fact'})];expect(seriesModel(rows)!.tableRows).toEqual(rows);});
 it('does not draw one observation per series',()=>{expect(seriesModel([row(1),row(2,{fact:{template:'topic.macro_level',slots:{series:'OTHER'}}})])).toBeNull();});
 it('keeps a masked item as a null gap even when it has a stale value',()=>{expect(seriesModel([row(1),row(2,{masked:true}),row(3)])!.points[1].y).toBeNull();});
});
