// playbooks.ts (spec §5.2): triggers = rules projection and order; static cards; the three-condition F4 mark matrix.
import {describe,expect,it} from 'vitest';
import type {RulesView,StrategyManifest} from './contract';
import type {F4CardLite,F4JudgmentDetail} from './f4-types';
import {buildPlaybooks,playbookTriggers,selectF4Mark} from './playbooks';
import {freezeDef} from './manifest';
import {FIXTURE_CATALOG} from './testing/fixture';

const RULES:RulesView={rulesVersion:'r/1',rows:[
 {rule_id:'pmi.2',type:'pmi',condition:{zh:'PMI 回落',en:'PMI falling'},support:{recession:0.5}},
 {rule_id:'pmi.1',type:'pmi',condition:{zh:'PMI 上升',en:'PMI rising'},support:{recovery:1,overheat:0.5}},
 {rule_id:'inflation_yoy.1',type:'inflation_yoy',condition:{zh:'通胀上升',en:'Inflation rising'},support:{overheat:1,stagflation:1,recovery:0}},
 {rule_id:'bond_yield.1',type:'bond_yield',condition:{zh:'收益率上行',en:'Yields rising'},support:{overheat:0.5}},
]};
const CARD:F4CardLite={judgment_id:'j1',lifecycle:'open',calibration:'insufficient',as_of:'2026-11-03',methodology:{id:'macro_regime',version:'v2'},selected:'overheat'};
const DETAIL:F4JudgmentDetail={judgment_id:'j1',as_of:'2026-11-03',selected:'overheat',inputs:[{kind:'macro_snapshot',ref:{snapshot_id:'snap:US:1'},snapshot:{snapshot_id:'snap:US:1'}}],settlements:[]};

describe('playbookTriggers',()=>{
 it('keeps rows with support > 0 for the regime, ordered by support desc then rule_id asc',()=>{
  expect(playbookTriggers(RULES,'overheat').map(t=>[t.rule_id,t.support])).toEqual([['inflation_yoy.1',1],['bond_yield.1',0.5],['pmi.1',0.5]]);
  expect(playbookTriggers(RULES,'recovery').map(t=>t.rule_id)).toEqual(['pmi.1']);
  expect(playbookTriggers(RULES,'recession')[0]).toEqual({rule_id:'pmi.2',type:'pmi',condition:{zh:'PMI 回落',en:'PMI falling'},support:0.5});
 });
});

describe('buildPlaybooks',()=>{
 it('renders four static cards from the frozen rules and catalog names, watch filtered to the region',()=>{
  const m={rules:RULES,catalog:FIXTURE_CATALOG.map(freezeDef)} as unknown as StrategyManifest;
  const cards=buildPlaybooks(m,'CN');
  expect(cards.map(c=>c.regime)).toEqual(['recovery','overheat','stagflation','recession']);
  expect(cards[1].triggers.map(t=>t.rule_id)).toEqual(['inflation_yoy.1','bond_yield.1','pmi.1']);
  expect(cards.every(c=>c.watch.every(w=>w.series_id.startsWith('CN_')))).toBe(true);
  expect(cards[0].watch.length).toBeGreaterThan(0);
  for(const c of cards)expect(Object.keys(c).sort()).toEqual(['implications','mechanism','regime','title','triggers','watch']);   // no F4 field, distribution, margin or hit rate
 });
});

describe('selectF4Mark',()=>{
 it('marks the selected playbook when method, lifecycle and snapshot all match',()=>{
  expect(selectF4Mark({card:CARD,detail:DETAIL,snapshotId:'snap:US:1'})).toEqual({
   mark:{regime:'overheat',judgment_id:'j1',snapshot_match:true,as_of:'2026-11-03'},
   summary:{judgment_id:'j1',selected:'overheat',lifecycle:'open',outcome:null,calibration:'insufficient',methodology:{id:'macro_regime',version:'v2'},as_of:'2026-11-03',href:'/intel/methods/macro_regime/v2'},
  });
 });
 it('a card on another snapshot is not highlighted (snapshot_match false, regime null)',()=>{
  const r=selectF4Mark({card:CARD,detail:DETAIL,snapshotId:'snap:US:2'});
  expect(r?.mark).toEqual({regime:null,judgment_id:'j1',snapshot_match:false,as_of:'2026-11-03'});
  expect(selectF4Mark({card:CARD,detail:null,snapshotId:'snap:US:1'})?.mark.snapshot_match).toBe(false);
  expect(selectF4Mark({card:CARD,detail:DETAIL,snapshotId:null})?.mark.snapshot_match).toBe(false);
 });
 it('other methods, versions or lifecycles show nothing',()=>{
  expect(selectF4Mark({card:{...CARD,methodology:{id:'macro_regime',version:'v1'}},detail:DETAIL,snapshotId:'snap:US:1'})).toBeNull();
  expect(selectF4Mark({card:{...CARD,methodology:{id:'other',version:'v2'}},detail:DETAIL,snapshotId:'snap:US:1'})).toBeNull();
  for(const lifecycle of ['abstained','void','withdrawn','pending_fill'])expect(selectF4Mark({card:{...CARD,lifecycle},detail:DETAIL,snapshotId:'snap:US:1'})).toBeNull();
  expect(selectF4Mark({card:null,detail:null,snapshotId:'snap:US:1'})).toBeNull();
 });
 it('a settled card reports the latest settlement outcome',()=>{
  const detail={...DETAIL,settlements:[{outcome:'hit',realized:'overheat',evidence:{note:'x'},settled_at:'2026-12-01T00:00:00Z'},{outcome:'miss',realized:'recession',evidence:{note:'x'},settled_at:'2027-01-01T00:00:00Z'}]};
  expect(selectF4Mark({card:{...CARD,lifecycle:'settled'},detail,snapshotId:'snap:US:1'})?.summary.outcome).toBe('miss');
 });
 it('a detail of another judgment contributes no settlement outcome',()=>{
  const detail={...DETAIL,judgment_id:'j2',settlements:[{outcome:'hit',realized:'overheat',evidence:{note:'x'},settled_at:'2026-12-01T00:00:00Z'}]};
  const r=selectF4Mark({card:{...CARD,lifecycle:'settled'},detail,snapshotId:'snap:US:1'});
  expect(r?.summary.outcome).toBeNull();expect(r?.mark.snapshot_match).toBe(false);
 });
});
