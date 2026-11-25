import {expect,it,vi} from 'vitest';
import {memoryTableClient} from '../../db/memory-table-client';
import {memoryVendorRawStore} from '../../vendor/raw-store';
import {VendorError} from '../../vendor/source';
import {fixtureGildataSource} from '../../vendor/gildata/fixture-source';
import {GildataParseError} from '../../vendor/gildata/envelope';
import {fixtureDirSource} from './fixtures-dir';
import {memoryVendorIndustryDb,VendorDbError} from './db';
import {runGildataFinancials,runGildataMemberships} from './ingest';
import {SW2021_L1_GILDATA} from './sw2021-gildata-codes';
const setup=()=>({db:memoryVendorIndustryDb(),tables:memoryTableClient(),raw:memoryVendorRawStore(),
 source:fixtureDirSource('src/lib/vendor/gildata/fixtures'),codeVersion:'test',now:()=>new Date('2026-11-24Z'),
 universe:SW2021_L1_GILDATA.filter(x=>['270000','480000'].includes(x.gildataCode))});
const opts={mode:'apply',triggeredBy:'script',fromYear:2024,toYear:2025} as const;
it('plans without fetching, previews the full grid without writes',async()=>{
 const d=setup();
 const writes=[vi.spyOn(d.raw,'put'),vi.spyOn(d.db,'recordRetrieval'),vi.spyOn(d.db,'createRun'),
 vi.spyOn(d.tables,'insert'),vi.spyOn(d.tables,'select'),vi.spyOn(d.tables,'update'),vi.spyOn(d.tables,'upsert')];
 expect((await runGildataFinancials(d,{...opts,mode:'plan'})).counts).toEqual({industries:2,planned_calls:2});
 expect(d.source.callsMade()).toBe(0);
 const preview=await runGildataFinancials(d,{...opts,mode:'dry-run'});
 expect(preview).toMatchObject({status:'dry_run',counts:{calls:2,industries_ok:2,periods:16,would_change:1}});
 expect(preview.counts.observations_ok+preview.counts.observations_missing).toBe(192);
 for(const spy of writes)expect(spy).not.toHaveBeenCalled();
 expect(await d.db.listRuns()).toEqual([]);
});
it('activates memberships once, retains each retrieval and refuses partial apply',async()=>{
 const d=setup();
 expect(await runGildataMemberships(d,{...opts,l1Codes:['801080.SI']})).toMatchObject({errors:[{code:'subset_apply_refused'}]});
 d.universe=d.universe.slice(0,1);
 expect(await runGildataMemberships(d,opts)).toMatchObject({status:'success',counts:{members:6}});
 expect(await runGildataMemberships(d,opts)).toMatchObject({status:'success',counts:{unchanged:1}});
 expect(await d.db.listRuns()).toHaveLength(1);
 expect(await d.db.listRetrievals(10)).toHaveLength(2);
});
it('retains rejected bytes and quarantine references, without exposing body text',async()=>{
 const d=setup(),source=fixtureGildataSource({resolve:()=>'sensitive invalid body'});
 const receipt=await runGildataFinancials({...d,source},opts);
 expect(receipt).toMatchObject({status:'failed',counts:{industries_failed:2,calls:2}});
 expect(JSON.stringify(receipt)).not.toContain('sensitive');
 const [r]=await d.db.listRetrievals(10);
 expect(new TextDecoder().decode(await d.raw.get(r.vendor,r.sha256))).toBe('sensitive invalid body');
 expect(d.tables.rows('dq_quarantine')).toHaveLength(2);
 expect(d.tables.rows('ingest_batches')[0].status).toBe('failed');
 expect(d.tables.rows('dq_freshness')[0].consecutive_errors).toBe(1);
 expect(await d.db.listRuns()).toEqual([]);
});
it('halts on auth and deadline, and fails a generation after staging errors',async()=>{
 const d=setup();
 expect(await runGildataFinancials(d,{...opts,deadlineMs:0})).toMatchObject({errors:[{code:'time_budget_exceeded'}]});
 expect(d.source.callsMade()).toBe(0);
 const fetch=vi.spyOn(d.source,'fetch').mockRejectedValue(new VendorError('vendor_auth_failed','sensitive'));
 expect(await runGildataFinancials(d,{...opts,mode:'dry-run'})).toMatchObject({errors:[{code:'vendor_auth_failed',key:'801080.SI'}]});
 expect(fetch).toHaveBeenCalledTimes(1);fetch.mockRestore();
 vi.spyOn(d.db,'activateRun').mockRejectedValue(new VendorDbError('incomplete_grid'));
 expect(await runGildataFinancials(d,opts)).toMatchObject({errors:[{code:'incomplete_grid'}]});
 expect(await d.db.listRuns()).toMatchObject([{status:'failed'}]);
});

it('stores a valid failure code and preserves the original activation error in the receipt',async()=>{
 const d=setup();
 vi.spyOn(d.db,'activateRun').mockRejectedValue(new GildataParseError('parse_failed','invalid_number'));
 const receipt=await runGildataFinancials(d,opts);
 expect(receipt.errors).toEqual([{code:'parse_failed:invalid_number'}]);
 expect(await d.db.listRuns()).toMatchObject([{status:'failed',failure_code:'parse_failed_invalid_number'}]);
});

it('validates apply dependencies before fetching and previews without any database',async()=>{
 const d=setup();
 expect(await runGildataFinancials({...d,codeVersion:null},opts)).toMatchObject({errors:[{code:'code_version_unavailable'}]});
 for(const name of ['source','raw','db','tables'] as const)
  expect(await runGildataFinancials({...d,[name]:undefined},opts)).toMatchObject({errors:[{code:'deps_unavailable'}]});
 expect(d.source.callsMade()).toBe(0);
 const result=await runGildataFinancials({...d,db:undefined},{...opts,mode:'dry-run'});
 expect(result.status).toBe('dry_run');expect(result.counts).not.toHaveProperty('would_change');
});
it('preserves the active generation after mixed outcomes and quarantines only evidence references',async()=>{
 const d=setup();
 await runGildataFinancials(d,opts);
 const previous=await d.db.activeRun('financials');
 const {loadFixtureBody}=await import('../../vendor/gildata/fixture-source');
 const source=fixtureGildataSource({resolve:()=>loadFixtureBody('src/lib/vendor/gildata/fixtures/financials-270000.json')});
 const result=await runGildataFinancials({...d,source},opts);
 expect(result).toMatchObject({status:'failed',counts:{industries_ok:1,industries_failed:1},errors:[{code:'request_mismatch:industry_mismatch',key:'801780.SI'}]});
 expect(d.tables.rows('ingest_batches').at(-1)?.status).toBe('failed');
 expect(await d.db.activeRun('financials')).toEqual(previous);
 expect(Object.keys(d.tables.rows('dq_quarantine')[0].payload as object).sort()).toEqual(['index_code','outcome','reason','retrieval_id','sha256']);
 expect(await d.db.listRuns('financials')).toHaveLength(1);
});
