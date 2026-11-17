import {expect,it} from 'vitest';
import {CATALOG_VERSION,MACRO_CATALOG,catalogById,indicatorsOf,regimeInputsOf} from './catalog';
import {DISPLAY_CATALOG,DISPLAY_CATALOG_VERSION} from './display-catalog';
import {WEIGHTS_V1,classifyRegime,regionWeights} from './regime';
import {releaseTimeliness} from './freshness';
import {collectableSeriesOf,seriesById} from './series-registry';
it('keeps display definitions outside the regime catalog and weights',()=>{
 expect(new Set(DISPLAY_CATALOG.map(d=>d.id)).size).toBe(6);
 for(const d of DISPLAY_CATALOG){
  expect(MACRO_CATALOG.some(c=>c.id===d.id)).toBe(false);expect(catalogById(d.id)).toBeUndefined();
  expect(d.weight).toBe(0);expect(WEIGHTS_V1[d.id]).toBeUndefined();expect(d.source?.fetchHost).toBe('fred.stlouisfed.org');
  expect(d.releaseLagDays).toBe(d.nativeFrequency==='weekly'?1:undefined);
  expect(Object.isFrozen(d)).toBe(true);expect(Object.isFrozen(d.source)).toBe(true);
  if(d.derive)expect(DISPLAY_CATALOG.find(n=>n.id===d.derive!.from&&!n.derive)).toBeDefined();
  expect(seriesById(d.id)).toBe(d);
 }
 for(const region of ['US','CN'] as const){
  for(const d of [...regimeInputsOf(region),...indicatorsOf(region)])expect(DISPLAY_CATALOG.some(x=>x.id===d.id)).toBe(false);
  const series=Object.fromEntries(DISPLAY_CATALOG.map(d=>[d.id,{latest:{observation_id:d.id,period_end:'2026-10-31',value_text:'1'}}]));
  const result=classifyRegime({region,series});expect(result.contributions).toEqual([]);
  expect(result.uncoveredWeight).toBe(Object.values(regionWeights(region)).reduce((a,b)=>a+b,0));
 }
 expect(collectableSeriesOf('fred_csv').slice(-3).map(d=>d.source?.seriesKey)).toEqual(['WALCL','RRPONTSYD','WTREGEN']);
 expect(DISPLAY_CATALOG_VERSION).toMatch(/^macro-catalog\/[0-9a-f]{12}$/);expect(DISPLAY_CATALOG_VERSION).not.toBe(CATALOG_VERSION);
 expect(CATALOG_VERSION).toBe('macro-catalog/30bcaa2a33c5');
});
it('uses a weekly release deadline with the publication lag and grace',()=>{
 const def={nativeFrequency:'weekly' as const,period:'day' as const,releaseLagDays:1};
 expect(releaseTimeliness(def,'2026-10-28','2026-11-08')).toBe('current');
 expect(releaseTimeliness(def,'2026-10-28','2026-11-09')).toBe('late');
 expect(releaseTimeliness(def,'2026-10-07','2026-11-08')).toBe('late');
});
