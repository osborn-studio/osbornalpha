import {describe,it,expect,vi,afterEach} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {TableError} from '../db/table-client';
import type {Row} from '../db/table-client';
import {upsertIssuerByIdentifiers} from './issuers';
import {attachSecurity} from './securities';
import type {IssuerInput} from './types';

const LEI_APPLE='HWUPKR0MPOU8FGXBT394';
const LEI_OTHER='529900T8BM49AURSDO55';
const KEYS={issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],issuer_identifier_claims:['id']};
const client=()=>memoryTableClient(KEYS);
const issuer=(over:Row):Row=>({status:'active',merged_into:null,lei:null,cik:null,usci:null,cninfo_org_id:null,canonical_name_en:null,provenance:{},updated_at:'2020-01-01T00:00:00.000Z',...over});
const dupErr=(t:string,code='23505')=>new TableError('insert',t,'duplicate key value violates unique constraint',code);

afterEach(()=>{vi.useRealTimers();});

describe('upsertIssuerByIdentifiers',()=>{
 it('creates a new issuer, reuses it on a matching hard id, enriches null fields and merges provenance per key',async()=>{
  const c=client();
  const first=await upsertIssuerByIdentifiers(c,{cik:'0000320193',canonical_name_en:'Apple Inc.',country_code:'US',provenance:{cik:{source:'sec'}}});
  expect(first.created).toBe(true);
  expect(c.rows('issuers')[0].cik).toBe('320193');
  const second=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'APPLE INC',provenance:{lei:{source:'gleif'}}});
  expect(second).toMatchObject({created:false,issuer_id:first.issuer_id});
  const row=c.rows('issuers')[0];
  expect(row.lei).toBe(LEI_APPLE);
  expect(row.canonical_name_en).toBe('Apple Inc.');
  expect(row.provenance).toEqual({cik:{source:'sec'},lei:{source:'gleif'}});
 });
 it('records a pending claim instead of writing when a hard identifier contradicts',async()=>{
  const c=client();
  await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple'});
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_OTHER,canonical_name_en:'X',provenance:{lei:{source:'test'}}});
  expect(out).toEqual({issuer_id:null,created:false,conflict:true,reason:'hard_id_mismatch'});
  expect(c.rows('issuers')).toHaveLength(1);
  expect(c.rows('issuers')[0].lei).toBe(LEI_APPLE);
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({id_type:'lei',value:LEI_OTHER,status:'pending',source:'test'})]);
 });
 it('files exactly one pending claim for a repeated identical conflict',async()=>{
  const c=client();
  await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE});
  for(let i=0;i<3;i++)expect(await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_OTHER})).toMatchObject({conflict:true});
  expect(c.rows('issuer_identifier_claims')).toHaveLength(1);
 });
 it('treats a 23505 on claim insert as an already-filed claim',async()=>{
  const c=client();
  await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE});
  const base=c.insert.bind(c);
  c.insert=async(t,row)=>{if(t==='issuer_identifier_claims')throw dupErr(t);return base(t,row);};
  expect(await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_OTHER})).toMatchObject({conflict:true});
 });
 it('rejects invalid hard identifiers before touching the database',async()=>{
  const c=memoryTableClient();
  await expect(upsertIssuerByIdentifiers(c,{cik:'abc',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:cik');
  await expect(upsertIssuerByIdentifiers(c,{lei:'BAD',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:lei');
  await expect(upsertIssuerByIdentifiers(c,{usci:'123',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:usci');
  await expect(upsertIssuerByIdentifiers(c,{cik:'320193',isin:'US0378331006'} as IssuerInput)).rejects.toThrow('invalid_identifier:isin');
  expect(c.rows('issuers')).toHaveLength(0);
 });
 it('treats blank identifier strings as missing',async()=>{
  const c=client();
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:'  ',usci:'',cninfo_org_id:' ',canonical_name_en:''});
  expect(out.created).toBe(true);
  expect(c.rows('issuers')[0]).toMatchObject({lei:null,usci:null,cninfo_org_id:null,canonical_name_en:null});
  await expect(upsertIssuerByIdentifiers(c,{lei:' ',cik:''})).rejects.toThrow('no_hard_identifier');
 });
 it('pads a short HKEX stock code to five digits',async()=>{
  const c=client();
  await upsertIssuerByIdentifiers(c,{cik:'1',hkex_stock_code_primary:' 700 '});
  expect(c.rows('issuers')[0].hkex_stock_code_primary).toBe('00700');
 });
 it('recovers from a unique-index race by re-reading and reusing the winner',async()=>{
  const c=client();
  const base=c.insert.bind(c);let raced=false;
  c.insert=async(t,row)=>{ if(t==='issuers'&&!raced){raced=true;await base('issuers',{...row,issuer_id:'winner'});throw dupErr('issuers');} return base(t,row); };
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',canonical_name_en:'Apple'});
  expect(out).toMatchObject({issuer_id:'winner',created:false});
  expect(c.rows('issuers')).toHaveLength(1);
 });
 it('redirects a merged candidate to its active target without copying the merged-away id',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'old',status:'merged',merged_into:'new',cik:'111'}));
  await c.insert('issuers',issuer({issuer_id:'new',cik:'222'}));
  const out=await upsertIssuerByIdentifiers(c,{cik:'111',lei:LEI_APPLE,provenance:{cik:{source:'x'},lei:{source:'gleif'}}});
  expect(out).toEqual({issuer_id:'new',created:false});
  const target=c.rows('issuers').find(r=>r.issuer_id==='new')!;
  expect(target).toMatchObject({cik:'222',lei:LEI_APPLE,provenance:{lei:{source:'gleif'}}});
  expect(target.provenance).not.toHaveProperty('cik');
  expect(c.rows('issuers')).toHaveLength(2);
 });
 it('reports inactive_issuer when a merge target is not active',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'old',status:'merged',merged_into:'gone',cik:'111'}));
  await c.insert('issuers',issuer({issuer_id:'gone',status:'dissolved',cik:'222'}));
  expect(await upsertIssuerByIdentifiers(c,{cik:'111'})).toEqual({issuer_id:null,created:false,conflict:true,reason:'inactive_issuer'});
  expect(c.rows('issuers')).toHaveLength(2);
 });
 it('reports inactive_issuer and files a claim when a candidate is dissolved',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'d',status:'dissolved',cik:'111'}));
  const out=await upsertIssuerByIdentifiers(c,{cik:'111',canonical_name_en:'Zombie',provenance:{cik:{source:'sec'}}});
  expect(out).toEqual({issuer_id:null,created:false,conflict:true,reason:'inactive_issuer'});
  expect(c.rows('issuers')).toHaveLength(1);
  expect(c.rows('issuers')[0].canonical_name_en).toBeNull();
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'d',id_type:'cik',value:'111',source:'sec',status:'pending'})]);
 });
 it('files a claim and does not overwrite when a conditional enrichment loses a race',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193'}));
  const base=c.update.bind(c);
  c.update=async(t,match,patch)=>{
   if(t==='issuers'&&'lei' in match){await base('issuers',{issuer_id:'a'},{lei:LEI_OTHER});return 0;}
   return base(t,match,patch);
  };
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple',provenance:{lei:{source:'gleif'},canonical_name_en:{source:'sec'}}});
  expect(out).toEqual({issuer_id:'a',created:false});
  const row=c.rows('issuers')[0];
  expect(row).toMatchObject({lei:LEI_OTHER,canonical_name_en:'Apple',provenance:{canonical_name_en:{source:'sec'}}});
  expect(row.provenance).not.toHaveProperty('lei');
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'a',id_type:'lei',value:LEI_APPLE})]);
 });
 it('accepts a lost enrichment race when the winner wrote the same value',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193'}));
  const base=c.update.bind(c);
  c.update=async(t,match,patch)=>{if(t==='issuers'&&'lei' in match){await base('issuers',{issuer_id:'a'},{lei:LEI_APPLE});return 0;}return base(t,match,patch);};
  await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE});
  expect(c.rows('issuer_identifier_claims')).toHaveLength(0);
 });
 it('files a claim and continues when enrichment hits a unique violation',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193'}));
  const base=c.update.bind(c);
  c.update=async(t,match,patch)=>{if(t==='issuers'&&'lei' in match)throw new TableError('update','issuers','duplicate key','23505');return base(t,match,patch);};
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple'});
  expect(out).toEqual({issuer_id:'a',created:false});
  expect(c.rows('issuers')[0]).toMatchObject({lei:null,canonical_name_en:'Apple'});
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'a',id_type:'lei',value:LEI_APPLE})]);
 });
 it('does not touch updated_at on a no-op reload',async()=>{
  vi.useFakeTimers({toFake:['Date']});
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const c=client();
  const input={cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple',provenance:{cik:{source:'sec'}}};
  await upsertIssuerByIdentifiers(c,input);
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
  const update=vi.spyOn(c,'update');
  await upsertIssuerByIdentifiers(c,input);
  expect(update).not.toHaveBeenCalled();
  expect(c.rows('issuers')[0].updated_at).toBe('2026-01-01T00:00:00.000Z');
 });
});

describe('attachSecurity',()=>{
 const sec={issuer_id:'a',ticker:'AAPL',share_class:'common' as const,is_primary:true,valid_from:'2000-01-01',source:'sec'};
 const raceInsert=(c:ReturnType<typeof client>,owner:string,code='23505')=>{
  const base=c.insert.bind(c);let raced=false;
  c.insert=async(t,row)=>{if(t==='issuer_securities'&&!raced){raced=true;await base(t,{...row,issuer_id:owner,valid_from:'1999-01-01'});throw dupErr(t,code);}return base(t,row);};
 };
 it('inserts once and reports duplicate for the same issuer even with a later valid_from',async()=>{
  const c=client();
  expect(await attachSecurity(c,sec)).toBe('inserted');
  expect(await attachSecurity(c,sec)).toBe('duplicate');
  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05'})).toBe('duplicate');
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
 it('reports conflict and writes nothing when another issuer currently owns the ticker',async()=>{
  const c=client();
  await attachSecurity(c,sec);
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2026-11-05'})).toBe('conflict');
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
 it('allows a new owner once the previous interval is closed',async()=>{
  const c=client();
  await attachSecurity(c,{...sec,valid_to:'2010-01-01'});
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2010-01-01'})).toBe('inserted');
 });
 it('reports duplicate when a closed interval is replayed',async()=>{
  const c=client();
  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01'})).toBe('inserted');
  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01'})).toBe('duplicate');
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
 it('validates and upper-cases the ISIN',async()=>{
  const c=client();
  await expect(attachSecurity(c,{...sec,isin:'US0378331006'})).rejects.toThrow('invalid_identifier:isin');
  expect(await attachSecurity(c,{...sec,isin:' us0378331005 '})).toBe('inserted');
  expect(c.rows('issuer_securities')[0].isin).toBe('US0378331005');
 });
 it('files one ISIN claim on a repeated ownership conflict',async()=>{
  const c=client();
  await attachSecurity(c,sec);
  for(let i=0;i<2;i++)expect(await attachSecurity(c,{...sec,issuer_id:'b',isin:'US0378331005'})).toBe('conflict');
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'b',id_type:'isin',value:'US0378331005'})]);
 });
 it('classifies a raced insert by re-reading the open owner',async()=>{
  const same=client();raceInsert(same,'a');
  expect(await attachSecurity(same,sec)).toBe('duplicate');
  const other=client();raceInsert(other,'b');
  expect(await attachSecurity(other,sec)).toBe('conflict');
 });
 it('classifies an exclusion violation (23P01) the same way',async()=>{
  const c=client();raceInsert(c,'b','23P01');
  expect(await attachSecurity(c,sec)).toBe('conflict');
 });
 it('rethrows a unique violation when no open owner explains it',async()=>{
  const c=client();
  c.insert=async(t)=>{throw dupErr(t);};
  await expect(attachSecurity(c,sec)).rejects.toBeInstanceOf(TableError);
 });
 it('maps the inactive-issuer trigger to issuer_not_active',async()=>{
  const c=client();
  c.insert=async(t)=>{throw new TableError('insert',t,'issuer_not_active','P0001');};
  await expect(attachSecurity(c,sec)).rejects.toThrow(/^issuer_not_active$/);
 });
});
