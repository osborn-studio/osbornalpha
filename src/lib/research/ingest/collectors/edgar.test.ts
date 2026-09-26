import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {makeMockCtx,type MockStore} from '../../test-support';
import type {ResearchCtx} from '../../store';
import {collectEdgar,htmlToText,primaryDocumentUrl} from './edgar';
import type {CollectorCompany} from './types';

const fx=(n:string)=>readFileSync(new URL(`../__fixtures__/collectors/${n}`,import.meta.url),'utf8');
const submissions=fx('edgar-submissions-1321655.json'),eightK=fx('edgar-8k-pltr-20260803.htm');
const pltr:CollectorCompany={entity_id:'e-pltr',names_en:['Palantir Technologies Inc.'],names_zh:[],home_market:'US',cik:'1321655',cninfo_org_id:null,exchange_codes:['PLTR']};
let ctx:ResearchCtx,store:MockStore;
beforeEach(()=>{({ctx,store}=makeMockCtx() as unknown as {ctx:ResearchCtx;store:MockStore});});
const fetchWith=(routes:Record<string,()=>Response>)=>vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);const hit=Object.entries(routes).find(([k])=>url.includes(k));return hit?hit[1]():new Response('nope',{status:404});});
const ok=(body:string,type='application/json')=>new Response(body,{status:200,headers:{'content-type':type}});

describe('EDGAR collector',()=>{
 it('ingests recent filings of the configured forms with available_at = acceptanceDateTime and the primary document text',async()=>{
  const fetch=fetchWith({'data.sec.gov/submissions/CIK0001321655.json':()=>ok(submissions),'/Archives/edgar/data/1321655/000132165526000039/pltr-20260803.htm':()=>ok(eightK,'text/html')});
  // Window covers exactly the fixture's 8-K whose primary document is recorded.
  const r=await collectEdgar({ctx,companies:[pltr],since:'2026-08-03T00:00:00Z',until:'2026-08-04T00:00:00Z',fetch,minIntervalMs:0,now:()=>new Date('2026-09-26T00:00:00Z'),forms:['8-K']}); // the same-day 10-Q has no recorded document
  expect(r).toMatchObject({source:'edgar',companies:1,ok:true,failures:[],fetched:1,inserted:1});
  const rows=store.rows('research_source_documents');
  const k8=rows.find(x=>x.metadata?.accession_number==='0001321655-26-000039')!;
  expect(k8).toMatchObject({source_type:'FILING',market:'US',permission:'public',origin_type:'filing',trust_level:'HIGH',entity_ids:['e-pltr'],available_at:'2026-08-03T20:06:14.000Z',event_time:'2026-08-03T00:00:00.000Z',published_at:'2026-08-03'});
  expect(k8.url).toBe('https://www.sec.gov/Archives/edgar/data/1321655/000132165526000039/pltr-20260803.htm');
  expect(k8.raw_text).toMatch(/Palantir/i);expect(k8.raw_text).not.toMatch(/<[a-z]+[^>]*>/i);
  expect(k8.title).toMatch(/^8-K/);
  // Form 4 and 144 are excluded by default; nothing outside the window.
  expect(rows.every(x=>!['4','144'].includes(x.metadata.form))).toBe(true);
  expect(rows.every(x=>x.available_at>='2026-08-03T00:00:00Z'&&x.available_at<'2026-08-04T00:00:00Z')).toBe(true);
  // UA is declared on every request; the submissions request comes first.
  for(const call of fetch.mock.calls) expect(((call as any)[1].headers as Record<string,string>)['User-Agent']).toMatch(/OsbornAlpha/);
 });
 it('records a document failure and continues when a primary document is missing, and dedupes on rerun',async()=>{
  const fetch=fetchWith({'data.sec.gov/submissions/CIK0001321655.json':()=>ok(submissions)});
  const r=await collectEdgar({ctx,companies:[pltr],since:'2026-08-01T00:00:00Z',until:'2026-08-31T00:00:00Z',fetch,minIntervalMs:0});
  expect(r.ok).toBe(false);
  expect(r.failures.some(f=>f.stage==='document'&&/404/.test(f.message))).toBe(true);
  // Filings whose primary document could not be fetched are still recorded from their index metadata.
  expect(r.inserted).toBeGreaterThanOrEqual(1);
  const again=await collectEdgar({ctx,companies:[pltr],since:'2026-08-01T00:00:00Z',until:'2026-08-31T00:00:00Z',fetch,minIntervalMs:0});
  expect(again.inserted).toBe(0);expect(again.duplicates).toBe(r.inserted);
 });
 it('fails the company at the list stage on a network error without throwing, and skips companies without a CIK',async()=>{
  const fetch=vi.fn(async()=>{throw new TypeError('fetch failed');});
  const r=await collectEdgar({ctx,companies:[pltr,{...pltr,entity_id:'e2',cik:null,names_en:['NoCik']}],since:'2026-08-01T00:00:00Z',fetch,minIntervalMs:0});
  expect(r.failures).toEqual([{company:'Palantir Technologies Inc.',stage:'list',message:expect.stringMatching(/fetch failed/),url:expect.stringContaining('CIK0001321655')}]);
  expect(r.skipped).toBe(1);expect(r.ok).toBe(false);
 });
 it('helpers: primary document URL and HTML→text',()=>{
  expect(primaryDocumentUrl('1321655','0001321655-26-000039','pltr-20260803.htm')).toBe('https://www.sec.gov/Archives/edgar/data/1321655/000132165526000039/pltr-20260803.htm');
  expect(htmlToText('<html><head><style>p{}</style><script>x()</script></head><body><p>A&nbsp;B &amp; C</p><div>D</div></body></html>')).toBe('A B & C D');
  expect(htmlToText('x'.repeat(300_000)).length).toBeLessThanOrEqual(200_000);
 });
});
