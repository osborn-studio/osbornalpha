// Indicator detail helpers (spec §3.3): windows, exact period changes, chart points, markers, asset tones.
import {describe,expect,it} from 'vitest';
import {assetChangeView,chartPoints,cycleKey,diffRows,markersOf,sourceJsonOf,windowFrom} from './detail-model';
const o=(pe:string,v:string)=>({observation_id:pe,period_end:pe,value_text:v,version:1,available_at:'2026-01-01T00:00:00Z'});
describe('detail model',()=>{
 it('window start dates (leap day clamps)',()=>{
  expect(windowFrom('y3','2026-11-06')).toBe('2023-11-06');expect(windowFrom('y5','2024-02-29')).toBe('2019-02-28');expect(windowFrom('all','2026-11-06')).toBeNull();
 });
 it('period changes are exact decimals in the series unit; the first row has none',()=>{
  expect(diffRows([o('2026-08-31','4.78'),o('2026-09-30','4.80'),o('2026-10-31','4.5')],'bp').map(r=>r.diff_text)).toEqual([null,'2','-30']);
  expect(diffRows([o('2026-08-31','0.1'),o('2026-09-30','0.3')],'pp').map(r=>r.diff_text)).toEqual([null,'0.2']);
 });
 it('chart points: levels or changes (first change skipped)',()=>{
  const obs=[o('2026-08-31','4.78'),o('2026-09-30','4.80')];
  expect(chartPoints(obs,'level','bp')).toEqual([{time:'2026-08-31',value:4.78},{time:'2026-09-30',value:4.8}]);
  expect(chartPoints(obs,'diff','bp')).toEqual([{time:'2026-09-30',value:2}]);
 });
 it('markers: derived events and FOMC meetings from the first plotted month, sorted',()=>{
  const ev=[{effective_date:'2024-09-18',change_bp:'-50'},{effective_date:'2019-08-01',change_bp:'-25'}] as Parameters<typeof markersOf>[0];
  const cal=[{start:'2024-09-17',end:'2024-09-18'}] as Parameters<typeof markersOf>[1];
  expect(markersOf(ev,cal,'2024-09-30')).toEqual([{time:'2024-09-18',kind:'calendar',text:'FOMC'},{time:'2024-09-18',kind:'derived',text:'-50 bp'}]);
 });
 it('cycle label keys distinguish policy cycles',()=>{
  expect(cycleKey({basis:'policy_events',direction:'up'})).toBe('detail.policyDirection.up');
  expect(cycleKey({basis:'trailing_median',direction:'down'})).toBe('detail.direction.down');
 });
 it('asset moves: signed, unit-suffixed, toned; missing stays missing',()=>{
  expect(assetChangeView({change_text:'2.6845',change_kind:'pct'})).toEqual({text:'+2.68%',tone:'up'});
  expect(assetChangeView({change_text:'-75',change_kind:'bp'})).toEqual({text:'−75 bp',tone:'down'});
  expect(assetChangeView({change_text:'0',change_kind:'pct'})).toEqual({text:'0.00%',tone:'flat'});
  expect(assetChangeView({change_text:null,change_kind:'bp'})).toEqual({text:'—',tone:'missing'});
 });
 it('source json from a catalog def',()=>{
  expect(sourceJsonOf({source:null})).toBeNull();
  expect(sourceJsonOf({source:{adapter:'fred_csv',fetchHost:'fred.stlouisfed.org',publisher:{zh:'a',en:'A'},seriesKey:'UNRATE',rights:'public_domain',attribution:{zh:'b',en:'B'}}}))
   .toEqual({publisher:{zh:'a',en:'A'},via:null,fetch_host:'fred.stlouisfed.org',adapter:'fred_csv',rights:'public_domain',attribution:{zh:'b',en:'B'}});
 });
});
