// F4 clock matcher contract (P5 draft 8 §§2.3, 2.4, 3.3); node-only fake HTTP.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ACCEPTED_F4_VERSIONS,fetchF4Reader,matchF4Card,type F4Reader} from './clock-f4';

const snapshotId='snap-current';
const distribution={recovery:.5,overheat:.3,stagflation:.1,recession:.1};
const claim={selected:'recovery',distribution,margin_pp:20,catalog_version:'catalog-1',scores_are_not_probabilities:true};
const card=(overrides:Record<string,unknown>={})=>({
 judgment_id:'j-1',lifecycle:'open',methodology:{id:'macro_regime',version:'v1',href:'/methods/v1',title:{en:'Never retain'}},
 inputs:[{kind:'macro_snapshot',ref:{snapshot_id:snapshotId}},{kind:'other',ref:{arbitrary:true}}],
 as_of:'2026-11-07T00:00:00Z',calibration:'ready',display:{headline:{en:'SECRET HEADLINE'}},...overrides,
});
const detail=(c=card(),j:Record<string,unknown>={})=>({card:c,judgment:{judgment_id:c.judgment_id,methodology_id:c.methodology.id,methodology_version:c.methodology.version,claim,...j}});
const reader=(cards:unknown,body:unknown=detail()):F4Reader=>({listCards:vi.fn(async()=>cards),detail:vi.fn(async()=>body)});
const match=(r:F4Reader|null,accepted?:readonly string[])=>matchF4Card(r,'US',snapshotId,accepted);

afterEach(()=>vi.useRealTimers());

describe('matchF4Card',()=>{
 it('uses the existing v1 contract and keeps only permitted card fields',async()=>{
  expect(ACCEPTED_F4_VERSIONS).toEqual(['v1']);
  const result=await match(reader({cards:[card()]}));
  expect(result).toEqual({status:'card',judgment_id:'j-1',claim,card:{selected:'recovery',lifecycle:'open',calibration:'ready',methodology:{id:'macro_regime',version:'v1',href:'/methods/v1'},as_of:'2026-11-07T00:00:00Z'}});
  expect(JSON.stringify(result)).not.toMatch(/SECRET HEADLINE|Never retain/);
 });
 it.each(['open','settled','abstained','pending_fill','void','withdrawn'] as const)('handles %s using the detail lifecycle',async lifecycle=>{
  const c=card({lifecycle,abstain_reason:'insufficient_inputs'});
  const result=await match(reader([c],detail(c)));
  if(lifecycle==='open'||lifecycle==='settled')expect(result).toMatchObject({status:'card',card:{lifecycle}});
  else expect(result).toEqual({status:'ineligible',judgment_id:'j-1',lifecycle,abstain_reason:'insufficient_inputs'});
 });
 it('rejects a list/detail lifecycle mismatch',async()=>{
  expect(await match(reader([card()],detail(card({lifecycle:'withdrawn'}))))).toEqual({status:'unavailable',reason:'detail_mismatch'});
 });
 it('orders candidates by accepted version, latest as_of, then lowest ID',async()=>{
  const cards=[card({judgment_id:'v1-new',as_of:'2026-12-01'}),card({judgment_id:'z',methodology:{id:'macro_regime',version:'v2',href:'/v2'},as_of:'2026-11-02'}),card({judgment_id:'a',methodology:{id:'macro_regime',version:'v2',href:'/v2'},as_of:'2026-11-02'})];
  const r=reader(cards,detail(cards[2]));
  expect(await match(r,['v1','v2'])).toMatchObject({status:'card',judgment_id:'a'});
  expect(r.detail).toHaveBeenCalledWith('a');
 });
 it('reports the latest earlier macro snapshot and does not fetch detail',async()=>{
  const older=card({judgment_id:'old',inputs:[{kind:'macro_snapshot',ref:{snapshot_id:'old-snap'}}],as_of:'2026-10-01'});
  const newer=card({judgment_id:'new',inputs:[{kind:'macro_snapshot',ref:{snapshot_id:'new-snap'}}],as_of:'2026-11-01'});
  const r=reader({cards:[older,newer]});
  expect(await match(r)).toEqual({status:'earlier',judgment_id:'new',earlier_snapshot_id:'new-snap'});
  expect(r.detail).not.toHaveBeenCalled();
 });
 it('returns none when there is no macro regime card',async()=>{
  const r=reader({cards:[card({methodology:{id:'other',version:'v1',href:'/other'}})]});
  expect(await match(r)).toEqual({status:'none'});
  expect(r.detail).not.toHaveBeenCalled();
 });
 it.each([
  {cards:'bad'}, {cards:[card({lifecycle:'unknown'})]}, {cards:[card({inputs:[{kind:'macro_snapshot',ref:{snapshot_id:42}}]})]},
  {cards:[card({methodology:{id:'macro_regime',version:'v1'}})]},
 ])('fails closed for malformed list response %#',async body=>{
  expect(await match(reader(body))).toMatchObject({status:'unavailable'});
 });
 it.each([
  {...claim,selected:'unknown'}, {...claim,distribution:{...distribution,recovery:Infinity}},
  {...claim,distribution:{recovery:.5}}, {...claim,margin_pp:'20'},
  {...claim,catalog_version:2}, {...claim,scores_are_not_probabilities:false},
 ])('fails closed for malformed claim %#',async bad=>{
  expect(await match(reader([card()],detail(card(),{claim:bad})))).toEqual({status:'unavailable',reason:'malformed_detail'});
 });
 it('rejects mismatched detail judgment identifiers and snapshot input',async()=>{
  expect(await match(reader([card()],detail(card(),{methodology_version:'v2'})))).toEqual({status:'unavailable',reason:'detail_mismatch'});
  const badCard=card({inputs:[{kind:'macro_snapshot',ref:{snapshot_id:'different'}}]});
  expect(await match(reader([card()],detail(badCard)))).toEqual({status:'unavailable',reason:'detail_mismatch'});
  const extra=card({inputs:[{kind:'macro_snapshot',ref:{snapshot_id:snapshotId}},{kind:'macro_snapshot',ref:{snapshot_id:'extra'}}]});
  expect(await match(reader([card()],detail(extra)))).toEqual({status:'unavailable',reason:'detail_mismatch'});
 });
 it('maps reader failures to unavailable',async()=>{
  const r: F4Reader={listCards:async()=>{throw new Error('network');},detail:async()=>null};
  expect(await match(r)).toEqual({status:'unavailable',reason:'exception'});
  expect(await match(null)).toEqual({status:'unavailable',reason:'no_base_url'});
 });
});

describe('fetchF4Reader',()=>{
 it('returns null without the site URL',()=>expect(fetchF4Reader({})).toBeNull());
 it('requests abstained cards through the public F4 route',async()=>{
  const fetcher=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>({ok:true,json:async()=>({cards:[]})} as Response));
  const r=fetchF4Reader({NEXT_PUBLIC_SITE_URL:'https://example.test'},fetcher as typeof fetch)!;
  expect(await match(r)).toEqual({status:'none'});
  const url=String(fetcher.mock.calls[0][0]);
  expect(url).toContain('/api/judgments?');
  expect(new URL(url).searchParams.get('include_abstained')).toBe('1');
  expect(new URL(url).searchParams.get('subject_key')).toBe('US');
 });
 it('fails closed on non-2xx',async()=>{
  const fetcher=vi.fn(async()=>({ok:false,status:503} as Response));
  expect(await match(fetchF4Reader({NEXT_PUBLIC_SITE_URL:'https://example.test'},fetcher as typeof fetch))).toEqual({status:'unavailable',reason:'http_503'});
 });
 it('aborts a stalled list at 3 seconds without requesting detail',async()=>{
  vi.useFakeTimers();
  const fetcher=vi.fn((_url:RequestInfo|URL,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
   init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));
  }));
  const pending=match(fetchF4Reader({NEXT_PUBLIC_SITE_URL:'https://example.test'},fetcher as typeof fetch));
  await vi.advanceTimersByTimeAsync(3000);
  expect(await pending).toEqual({status:'unavailable',reason:'timeout'});
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
});
