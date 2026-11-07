// Correlation (spec §7): closed-form r, lag direction, gates, rolling, event windows, byte-identical recompute.
// Fixture: indicator x_t = (100 + 25·(t mod 3) + t)/100 percent (changeKind bp), asset a_s = 2·x_{s−1} (a yield, bp).
//   Δx_bp cycles through −49, 26, 26; the asset repeats 2·Δx one month later, so with lag +1 (indicator leads) r = 1,
//   slope 2, intercept 0. Lag −1 pairs (−49,26),(26,−49),(26,26)·2 over 15 full periods: r = −1875/3750 = −0.5,
//   slope −1, intercept 3. Lag 0 (n = 46, one partial period): r = −15/31, slope −30/31, intercept 142/31.
import {describe,expect,it} from 'vitest';
import {AnalysisError,pearson,quartiles,runAnalysis,type AnalysisSpec,type EventResult,type FrozenInputs,type PairResult,type RollingResult} from './correlation';
const BASE=2021*12;
const me=(i:number)=>new Date(Date.UTC(Math.floor((BASE+i)/12),(BASE+i)%12+1,0)).toISOString().slice(0,10);
const hund=(n:number)=>{const s=String(n).padStart(3,'0');return `${s.slice(0,-2)}.${s.slice(-2)}`;};   // integer hundredths → decimal text
function fixture(L:number):FrozenInputs{
 const xh=Array.from({length:L},(_,t)=>100+25*(t%3)+t);
 return {
  indicator:{series_id:'US_DFF',source_series_id:'US_DFF',change_kind:'bp',observations:xh.map((v,t)=>({observation_id:`x${t}`,period_end:me(t),value_text:hund(v)}))},
  asset:{series_id:'US_UST10Y',source_series_id:'US_DGS10',change_kind:'bp',observations:Array.from({length:L},(_,i)=>i+1).map(s=>({observation_id:`a${s}`,period_end:me(s),value_text:hund(2*xh[s-1])}))},
  cutoff:'2026-11-06T00:00:00.000Z',catalog_version:'macro-catalog/test',
 };
}
const spec=(o:Partial<AnalysisSpec>={}):AnalysisSpec=>({request_id:'11111111-1111-4111-8111-111111111111',kind:'change',indicator_id:'US_DFF',asset_id:'US_UST10Y',lag:0,window:'all',...o});
const run=(s:AnalysisSpec,i:FrozenInputs)=>runAnalysis(s,i,'test-sha');
const code=(f:()=>unknown)=>{try{f();}catch(e){return e instanceof AnalysisError?e.code:String(e);}return 'no error';};

describe('pearson',()=>{
 it('matches the hand computation on x=[1..5], y=[2,4,5,4,5]',()=>{
  // mx=3, my=4; dx=[-2,-1,0,1,2], dy=[-2,0,1,0,1]; sxy=6, sxx=10, syy=6 → r=6/√60, slope=0.6, intercept=4−0.6·3=2.2
  const p=pearson([1,2,3,4,5],[2,4,5,4,5]);
  expect(p.r).toBeCloseTo(6/Math.sqrt(60),12);expect(p.slope).toBeCloseTo(0.6,12);expect(p.intercept).toBeCloseTo(2.2,12);
 });
 it('zero variance is an error',()=>{expect(code(()=>pearson([1,1,1],[1,2,3]))).toBe('zero_variance');});
});

describe('change / level',()=>{
 const inp=fixture(48);
 it('lag +1 (indicator leads): r = 1, slope 2, intercept 0',()=>{
  const r=run(spec({lag:1}),inp) as PairResult;
  expect(r.kind).toBe('change');expect(r.n).toBe(47);expect(r.from).toBe('2021-02');expect(r.to).toBe('2024-12');
  expect(r.r).toBeCloseTo(1,12);expect(r.slope).toBeCloseTo(2,12);expect(r.intercept).toBeCloseTo(0,12);
  expect(r.pairs[0]).toEqual({t:'2021-02',s:'2021-03',x:26,y:52});
  expect([r.x_unit,r.y_unit,r.exploratory]).toEqual(['bp','bp',false]);
 });
 it('lag −1: r = −0.5 exactly over complete periods',()=>{
  const r=run(spec({lag:-1}),inp) as PairResult;
  expect(r.n).toBe(45);expect(r.r).toBeCloseTo(-0.5,12);expect(r.slope).toBeCloseTo(-1,12);expect(r.intercept).toBeCloseTo(3,12);
 });
 it('lag 0: r = −15/31',()=>{
  const r=run(spec({lag:0}),inp) as PairResult;
  expect(r.n).toBe(46);expect(r.r).toBeCloseTo(-15/31,12);expect(r.slope).toBeCloseTo(-30/31,12);expect(r.intercept).toBeCloseTo(142/31,12);
 });
 it('level mode is exploratory and uses raw values',()=>{
  const r=run(spec({kind:'level',lag:1}),inp) as PairResult;
  expect(r.kind).toBe('level');expect(r.exploratory).toBe(true);expect(r.x_unit).toBe('level');expect(r.pairs[0]).toEqual({t:'2021-01',s:'2021-02',x:1,y:2});
 });
 it('window keeps the last 60 / 120 pair months',()=>{
  const big=fixture(100);
  const five=run(spec({lag:1,window:'5y'}),big) as PairResult;
  expect(five.n).toBe(60);expect(five.from).toBe('2024-05');expect(five.to).toBe('2029-04');
  expect((run(spec({lag:1,window:'10y'}),big) as PairResult).n).toBe(99);
 });
 it('n < 36 → insufficient_sample',()=>{expect(code(()=>run(spec({lag:1}),fixture(30)))).toBe('insufficient_sample');});
 it('constant asset → zero_variance',()=>{
  const i=fixture(48);i.asset.observations=i.asset.observations.map(o=>({...o,value_text:'2'}));
  expect(code(()=>run(spec({lag:1}),i))).toBe('zero_variance');
 });
 it('a non-positive price used in a log return → non_positive_price',()=>{
  const i=fixture(48);i.asset.change_kind='pct';i.asset.observations[10]={...i.asset.observations[10],value_text:'0'};
  expect(code(()=>run(spec({lag:1}),i))).toBe('non_positive_price');
 });
 it('price assets use log returns',()=>{
  const i=fixture(48);i.asset.change_kind='pct';
  const r=run(spec({lag:1}),i) as PairResult;
  expect(r.y_unit).toBe('log_return');expect(r.pairs[0].y).toBeCloseTo(Math.log(2.52/2.00),15);
 });
 it('duplicate months in frozen inputs are rejected',()=>{
  const i=fixture(48);i.indicator.observations.push({...i.indicator.observations[5],observation_id:'dup'});
  expect(code(()=>run(spec({lag:1}),i))).toBe('invalid_inputs');
 });
});

describe('rolling',()=>{
 it('36-month windows ending at each pair month; windows with < 30 pairs are omitted',()=>{
  const r=run(spec({kind:'rolling',lag:1}),fixture(48)) as RollingResult;
  expect(r.points).toHaveLength(18);
  expect(r.points[0]).toMatchObject({end:'2023-07',n:30});expect(r.points[17]).toMatchObject({end:'2024-12',n:36});
  expect(r.points.every(p=>Math.abs(p.r-1)<1e-12)).toBe(true);
  expect([r.window_months,r.min_pairs]).toEqual([36,30]);
 });
 it('no window with ≥ 30 pairs → insufficient_sample',()=>{expect(code(()=>run(spec({kind:'rolling',lag:1}),fixture(25)))).toBe('insufficient_sample');});
});

describe('event_window',()=>{
 const asset=Array.from({length:72},(_,i)=>({observation_id:`y${i}`,period_end:me(i),value_text:hund(200+i)}));   // +1 bp per month
 const evAt=(i:number)=>({effective_date:`${me(i).slice(0,7)}-15`,change_bp:'-25',evidence:['a','b','c','d']});
 const inputs=(anchors:number[]):FrozenInputs=>({...fixture(48),asset:{series_id:'US_UST10Y',source_series_id:'US_DGS10',change_kind:'bp',observations:asset},events:anchors.map(evAt)});
 const ew=(o:Partial<AnalysisSpec>={})=>spec({kind:'event_window',event_n:6,...o});
 it('keeps complete, non-overlapping events (earlier wins) and gives distribution stats at ≥ 5',()=>{
  const r=run(ew(),inputs([10,15,23,36,49,62,70])) as EventResult;
  expect(r.candidates).toBe(7);expect(r.independent).toBe(5);
  expect(r.dropped).toEqual([{effective_date:'2022-04-15',reason:'overlap'},{effective_date:'2026-11-15',reason:'incomplete_window'}]);
  expect(r.events.map(e=>[e.anchor,e.pre,e.post])).toEqual([['2021-11',6,6],['2022-12',6,6],['2024-01',6,6],['2025-02',6,6],['2026-03',6,6]]);
  expect(r.stats).toEqual({pre:{median:6,q1:6,q3:6},post:{median:6,q1:6,q3:6}});
  expect(r.y_unit).toBe('bp');
 });
 it('fewer than 5 independent events → per-event table only',()=>{
  const r=run(ew(),inputs([10,23,36,49])) as EventResult;
  expect(r.independent).toBe(4);expect(r.stats).toBeNull();expect(r.events).toHaveLength(4);
 });
 it('no events → no_events',()=>{expect(code(()=>run(ew(),inputs([])))).toBe('no_events');});
});

describe('quartiles',()=>{
 it('type-7 interpolation',()=>{
  expect(quartiles([5,1,3,2,4])).toEqual({median:3,q1:2,q3:4});
  expect(quartiles([1,2,3,4])).toEqual({median:2.5,q1:1.75,q3:3.25});
 });
});

describe('recompute',()=>{
 it('same frozen inputs → byte-identical results, including after a JSON round trip and storage reordering',()=>{
  for(const s of [spec({lag:1}),spec({kind:'level',lag:2}),spec({kind:'rolling',lag:1})]){
   const inp=fixture(60);
   const a=JSON.stringify(run(s,inp));
   expect(JSON.stringify(run(s,JSON.parse(JSON.stringify(inp))))).toBe(a);
   const shuffled={...inp,indicator:{...inp.indicator,observations:[...inp.indicator.observations].reverse()},asset:{...inp.asset,observations:[...inp.asset.observations].reverse()}};
   expect(JSON.stringify(run(s,shuffled))).toBe(a);
  }
 });
});
