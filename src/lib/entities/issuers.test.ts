import {describe,it,expect,vi,afterEach} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {TableError} from '../db/table-client';
import type {Row} from '../db/table-client';
import {upsertIssuerByIdentifiers} from './issuers';
import {ProvenanceError} from './provenance';
import {attachSecurity} from './securities';
import type {IssuerInput} from './types';

const LEI_APPLE='HWUPKR0MPOU8FGXBT394';
const LEI_OTHER='529900T8BM49AURSDO55';
const KEYS={issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],issuer_identifier_claims:['id']};
const client=()=>memoryTableClient(KEYS);
// The memory client matches with ===, so every column a real row has must be present (null when absent),
// and the fixture must be a state PostgreSQL allows (issuers_has_name: at least one name).
const issuer=(over:Row):Row=>({
 status:'active',merged_into:null,lei:null,cik:null,usci:null,cninfo_org_id:null,hkex_stock_code_primary:null,
 canonical_name_zh:null,canonical_name_en:'Test Co',country_code:null,provenance:{},
 created_at:'2020-01-01T00:00:00.000Z',updated_at:'2020-01-01T00:00:00.000Z',...over,
});
const dupErr=(t:string,code='23505',msg='duplicate key value violates unique constraint')=>new TableError('insert',t,msg,code);
const claims=(c:ReturnType<typeof client>)=>c.rows('issuer_identifier_claims').map(r=>({issuer_id:r.issuer_id,id_type:r.id_type,value:r.value})).sort((a,b)=>`${a.issuer_id}${a.id_type}`.localeCompare(`${b.issuer_id}${b.id_type}`));

afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

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
  await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple'});
  for(let i=0;i<3;i++)expect(await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_OTHER})).toMatchObject({conflict:true});
  expect(c.rows('issuer_identifier_claims')).toHaveLength(1);
 });
 it('treats a 23505 on claim insert as an already-filed claim',async()=>{
  const c=client();
  await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple'});
  const base=c.insert.bind(c);
  c.insert=async(t,row)=>{if(t==='issuer_identifier_claims')throw dupErr(t);return base(t,row);};
  expect(await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_OTHER})).toMatchObject({conflict:true});
 });
 it('rejects invalid identifiers before touching the database',async()=>{
  const c=memoryTableClient();
  await expect(upsertIssuerByIdentifiers(c,{cik:'abc',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:cik');
  await expect(upsertIssuerByIdentifiers(c,{lei:'BAD',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:lei');
  await expect(upsertIssuerByIdentifiers(c,{usci:'123',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:usci');
  await expect(upsertIssuerByIdentifiers(c,{cik:'320193',isin:'US0378331006'} as IssuerInput)).rejects.toThrow('invalid_identifier:isin');
  for(const hk of ['123456','0700.HK','abc'])await expect(upsertIssuerByIdentifiers(c,{cik:'1',canonical_name_en:'X',hkex_stock_code_primary:hk})).rejects.toThrow('invalid_identifier:hkex');
  expect(c.rows('issuers')).toHaveLength(0);
 });
 it('treats blank identifier strings as missing',async()=>{
  const c=client();
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:'  ',usci:'',cninfo_org_id:' ',hkex_stock_code_primary:' ',canonical_name_en:'',canonical_name_zh:'苹果'});
  expect(out.created).toBe(true);
  expect(c.rows('issuers')[0]).toMatchObject({lei:null,usci:null,cninfo_org_id:null,hkex_stock_code_primary:null,canonical_name_en:null,canonical_name_zh:'苹果'});
  await expect(upsertIssuerByIdentifiers(c,{lei:' ',cik:''})).rejects.toThrow('no_hard_identifier');
 });
 it('requires a name to create an issuer but not to match an existing one',async()=>{
  const c=client();
  await expect(upsertIssuerByIdentifiers(c,{cik:'320193'})).rejects.toThrow('name_required');
  await expect(upsertIssuerByIdentifiers(c,{cik:'320193',canonical_name_en:' ',canonical_name_zh:''})).rejects.toThrow('name_required');
  expect(c.rows('issuers')).toHaveLength(0);
  await upsertIssuerByIdentifiers(c,{cik:'320193',canonical_name_en:'Apple'});
  expect(await upsertIssuerByIdentifiers(c,{cik:'320193'})).toMatchObject({created:false});
 });
 it('pads a short HKEX stock code to five digits',async()=>{
  const c=client();
  await upsertIssuerByIdentifiers(c,{cik:'1',canonical_name_en:'Tencent',hkex_stock_code_primary:' 700 '});
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
  await c.insert('issuers',issuer({issuer_id:'new',cik:'222'}));
  await c.insert('issuers',issuer({issuer_id:'old',status:'merged',merged_into:'new',cik:'111'}));
  const out=await upsertIssuerByIdentifiers(c,{cik:'111',lei:LEI_APPLE,provenance:{cik:{source:'x'},lei:{source:'gleif'}}});
  expect(out).toEqual({issuer_id:'new',created:false});
  const target=c.rows('issuers').find(r=>r.issuer_id==='new')!;
  expect(target).toMatchObject({cik:'222',lei:LEI_APPLE,provenance:{lei:{source:'gleif'}}});
  expect(target.provenance).not.toHaveProperty('cik');
  expect(c.rows('issuers')).toHaveLength(2);
 });
 it('reports inactive_issuer when a merge target is not active and claims only differing ids on the holder',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'gone',status:'dissolved',cik:'222'}));
  await c.insert('issuers',issuer({issuer_id:'old',status:'merged',merged_into:'gone',cik:'111'}));
  expect(await upsertIssuerByIdentifiers(c,{cik:'111'})).toEqual({issuer_id:null,created:false,conflict:true,reason:'inactive_issuer'});
  expect(claims(c)).toEqual([]);
  expect(await upsertIssuerByIdentifiers(c,{cik:'111',lei:LEI_APPLE})).toMatchObject({conflict:true,reason:'inactive_issuer'});
  expect(claims(c)).toEqual([{issuer_id:'old',id_type:'lei',value:LEI_APPLE}]);
  expect(c.rows('issuers')).toHaveLength(2);
 });
 it('reports inactive_issuer for a dissolved candidate, writes nothing and claims only the differing id',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'d',status:'dissolved',cik:'111'}));
  const out=await upsertIssuerByIdentifiers(c,{cik:'111',lei:LEI_APPLE,canonical_name_zh:'僵尸',provenance:{lei:{source:'gleif'}}});
  expect(out).toEqual({issuer_id:null,created:false,conflict:true,reason:'inactive_issuer'});
  expect(c.rows('issuers')).toEqual([expect.objectContaining({issuer_id:'d',lei:null,canonical_name_zh:null})]);
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'d',id_type:'lei',value:LEI_APPLE,source:'gleif',status:'pending'})]);
 });
 it('reports identifiers_split when incoming ids hit an active and an inactive issuer',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'222'}));
  await c.insert('issuers',issuer({issuer_id:'d',status:'dissolved',cik:'111',lei:LEI_APPLE}));
  const out=await upsertIssuerByIdentifiers(c,{cik:'222',lei:LEI_APPLE});
  expect(out).toEqual({issuer_id:null,created:false,conflict:true,reason:'identifiers_split'});
  expect(claims(c)).toEqual([{issuer_id:'a',id_type:'lei',value:LEI_APPLE},{issuer_id:'d',id_type:'cik',value:'222'}]);
 });
 it('returns hard_id_mismatch and files a claim when a conditional hard-id enrichment loses a race',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193',canonical_name_en:null,canonical_name_zh:'苹果'}));
  const base=c.update.bind(c);
  c.update=async(t,match,patch)=>{
   if(t==='issuers'&&'lei' in match){await base('issuers',{issuer_id:'a'},{lei:LEI_OTHER});return base(t,match,patch);}
   return base(t,match,patch);
  };
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple',provenance:{lei:{source:'gleif'}}});
  expect(out).toEqual({issuer_id:null,created:false,conflict:true,reason:'hard_id_mismatch'});
  const row=c.rows('issuers')[0];
  expect(row).toMatchObject({lei:LEI_OTHER,canonical_name_en:null,provenance:{}});
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'a',id_type:'lei',value:LEI_APPLE,source:'gleif'})]);
 });
 it('accepts a lost enrichment race when the winner wrote the same value',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193'}));
  const base=c.update.bind(c);
  c.update=async(t,match,patch)=>{if(t==='issuers'&&'lei' in match){await base('issuers',{issuer_id:'a'},{lei:LEI_APPLE});return base(t,match,patch);}return base(t,match,patch);};
  expect(await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE})).toEqual({issuer_id:'a',created:false});
  expect(c.rows('issuer_identifier_claims')).toHaveLength(0);
 });
 it('returns hard_id_mismatch and files a claim when a hard-id enrichment hits a unique violation',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193',canonical_name_en:null,canonical_name_zh:'苹果'}));
  const base=c.update.bind(c);
  c.update=async(t,match,patch)=>{if(t==='issuers'&&'lei' in match)throw new TableError('update','issuers','duplicate key','23505');return base(t,match,patch);};
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple'});
  expect(out).toEqual({issuer_id:null,created:false,conflict:true,reason:'hard_id_mismatch'});
  expect(c.rows('issuers')[0]).toMatchObject({lei:null,canonical_name_en:null});
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'a',id_type:'lei',value:LEI_APPLE})]);
 });
 it('files a claim and continues when a cninfo_org_id enrichment hits a unique violation',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193',canonical_name_en:null,canonical_name_zh:'苹果'}));
  const base=c.update.bind(c);
  c.update=async(t,match,patch)=>{if(t==='issuers'&&'cninfo_org_id' in match)throw new TableError('update','issuers','duplicate key','23505');return base(t,match,patch);};
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',cninfo_org_id:'gssz0000001',canonical_name_en:'Apple'});
  expect(out).toEqual({issuer_id:'a',created:false});
  expect(c.rows('issuers')[0]).toMatchObject({cninfo_org_id:null,canonical_name_en:'Apple'});
  expect(claims(c)).toEqual([{issuer_id:'a',id_type:'cninfo_org_id',value:'gssz0000001'}]);
 });
 it('claims a cninfo_org_id that contradicts the stored value and continues enrichment',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193',cninfo_org_id:'gssz0000001',canonical_name_en:null,canonical_name_zh:'苹果'}));
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',cninfo_org_id:'gssz0000002',canonical_name_en:'Apple'});
  expect(out).toEqual({issuer_id:'a',created:false});
  expect(c.rows('issuers')[0]).toMatchObject({cninfo_org_id:'gssz0000001',canonical_name_en:'Apple'});
  expect(claims(c)).toEqual([{issuer_id:'a',id_type:'cninfo_org_id',value:'gssz0000002'}]);
 });
 it('returns inactive_issuer and claims differing ids when the issuer is merged during enrichment',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'b'}));
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193'}));
  const base=c.update.bind(c);
  c.update=async(t,match,patch)=>{
   if(t==='issuers'&&'lei' in match)await base('issuers',{issuer_id:'a'},{status:'merged',merged_into:'b'});
   return base(t,match,patch);
  };
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple'});
  expect(out).toEqual({issuer_id:null,created:false,conflict:true,reason:'inactive_issuer'});
  expect(c.rows('issuers').find(r=>r.issuer_id==='a')).toMatchObject({lei:null,canonical_name_en:'Test Co',status:'merged'});
  expect(claims(c)).toEqual([{issuer_id:'a',id_type:'lei',value:LEI_APPLE}]);
 });
 it('returns inactive_issuer without claims when the issuer disappears during enrichment',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193'}));
  let gone=false;
  const baseU=c.update.bind(c),baseS=c.select.bind(c);
  c.update=async(t,match,patch)=>{if(t==='issuers'&&'lei' in match){gone=true;return 0;}return baseU(t,match,patch);};
  c.select=async(t,match,opts)=>gone&&t==='issuers'?[]:baseS(t,match,opts);
  expect(await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE})).toEqual({issuer_id:null,created:false,conflict:true,reason:'inactive_issuer'});
  expect(claims(c)).toEqual([]);
 });
 it('retries the provenance merge once when updated_at moved underneath it',async()=>{
  const c=client();
  await c.insert('issuers',issuer({issuer_id:'a',cik:'320193',provenance:{cik:{source:'sec'}}}));
  const base=c.update.bind(c);let raced=false;const provMatches:Row[]=[];
  c.update=async(t,match,patch)=>{
   if(t==='issuers'&&'provenance' in patch){
    provMatches.push(match);
    if(!raced){raced=true;await base('issuers',{issuer_id:'a'},{provenance:{cik:{source:'sec'},country_code:{source:'other'}},updated_at:'2030-01-01T00:00:00.000Z'});}
   }
   return base(t,match,patch);
  };
  expect(await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,provenance:{lei:{source:'gleif'}}})).toEqual({issuer_id:'a',created:false});
  expect(provMatches).toHaveLength(2);
  expect(provMatches[0]).toMatchObject({issuer_id:'a',status:'active'});
  expect(c.rows('issuers')[0].provenance).toEqual({cik:{source:'sec'},country_code:{source:'other'},lei:{source:'gleif'}});
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
 const EV={kind:'provider_mapping' as const,evidence:{source:'sec',as_of:'2026-11-05',evidence_sha256:'e'.repeat(64)}};
 const sec={issuer_id:'a',ticker:'AAPL',share_class:'common' as const,is_primary:true,valid_from:'2000-01-01',source:'sec',claimEvidence:EV};
 const closed=(valid_to:string)=>({valid_to,valid_to_method:'unrecorded' as const});
 const claimKeys=(c:ReturnType<typeof client>)=>c.rows('issuer_identifier_claims').map(r=>({issuer_id:r.issuer_id,op:r.op,id_type:r.id_type,value:r.value,target_key:r.target_key}));
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
 it('trims and upper-cases the ticker and rejects a blank one',async()=>{
  const c=client();
  expect(await attachSecurity(c,{...sec,ticker:' aapl '})).toBe('inserted');
  expect(c.rows('issuer_securities')[0].ticker).toBe('AAPL');
  expect(await attachSecurity(c,sec)).toBe('duplicate');
  await expect(attachSecurity(c,{...sec,ticker:'  '})).rejects.toThrow('invalid_ticker');
 });
 it('reports conflict and writes nothing when another issuer currently owns the ticker',async()=>{
  const c=client();
  await attachSecurity(c,sec);
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2026-11-05'})).toBe('conflict');
  expect(c.rows('issuer_securities')).toHaveLength(1);
  expect(c.rows('issuer_identifier_claims')).toEqual([]);                    // no ISIN, nothing to claim
 });
 it('allows a new owner once the previous interval is closed',async()=>{
  const c=client();
  await attachSecurity(c,{...sec,...closed('2010-01-01')});
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2010-01-01'})).toBe('inserted');
 });
 it('inserts closed history that ends before the open owner starts',async()=>{
  const c=client();
  expect(await attachSecurity(c,{...sec,valid_from:'2010-01-01'})).toBe('inserted');
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2000-01-01',...closed('2005-01-01')})).toBe('inserted');
  expect(await attachSecurity(c,{...sec,issuer_id:'c',valid_from:'2005-01-01',...closed('2010-01-01')})).toBe('inserted');
  expect(c.rows('issuer_securities')).toHaveLength(3);
 });
 it('reports conflict without a claim when a closed window overlaps another issuer',async()=>{
  const c=client();
  await attachSecurity(c,{...sec,valid_from:'2010-01-01'});
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2005-01-01',...closed('2012-01-01')})).toBe('conflict');
  expect(c.rows('issuer_securities')).toHaveLength(1);
  expect(c.rows('issuer_identifier_claims')).toEqual([]);
 });
 it('reports duplicate when a closed interval is replayed',async()=>{
  const c=client();
  expect(await attachSecurity(c,{...sec,...closed('2010-01-01')})).toBe('inserted');
  expect(await attachSecurity(c,{...sec,...closed('2010-01-01')})).toBe('duplicate');
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
 it('reports conflict when a replay changes valid_to or the ISIN, claiming only a differing ISIN on that row',async()=>{
  const c=client();
  expect(await attachSecurity(c,{...sec,...closed('2010-01-01'),isin:'US0378331005'})).toBe('inserted');
  expect(await attachSecurity(c,{...sec,...closed('2011-01-01')})).toBe('conflict');
  expect(await attachSecurity(c,sec)).toBe('conflict');                       // the open replay of a closed row
  expect(c.rows('issuer_identifier_claims')).toEqual([]);
  expect(await attachSecurity(c,{...sec,...closed('2010-01-01')})).toBe('duplicate');
  expect(await attachSecurity(c,{...sec,...closed('2010-01-01'),isin:'US5949181045'})).toBe('conflict');
  expect(claimKeys(c)).toEqual([{issuer_id:'a',op:'correct_identifier',id_type:'isin',value:'US5949181045',target_key:'correct_identifier:a|AAPL|2000-01-01'}]);
  expect(c.rows('issuer_identifier_claims')[0].detail).toMatchObject({evidence_kind:'provider_mapping',params:{expected_current:'US0378331005',new_value:'US5949181045'},evidence:EV.evidence});
  expect(c.rows('issuer_securities')).toEqual([expect.objectContaining({valid_to:'2010-01-01',isin:'US0378331005'})]);
 });
 it('files set_identifier when the same row has no ISIN yet',async()=>{
  const c=client();
  expect(await attachSecurity(c,sec)).toBe('inserted');
  expect(await attachSecurity(c,{...sec,isin:'US0378331005'})).toBe('conflict');
  expect(claimKeys(c)).toEqual([{issuer_id:'a',op:'set_identifier',id_type:'isin',value:'US0378331005',target_key:'set_identifier:a|AAPL|2000-01-01'}]);
 });
 it('validates and upper-cases the ISIN',async()=>{
  const c=client();
  await expect(attachSecurity(c,{...sec,isin:'US0378331006'})).rejects.toThrow('invalid_identifier:isin');
  expect(await attachSecurity(c,{...sec,isin:' us0378331005 '})).toBe('inserted');
  expect(c.rows('issuer_securities')[0].isin).toBe('US0378331005');
 });
 it('files one attach_security claim on a repeated ownership conflict',async()=>{
  const c=client();
  await attachSecurity(c,sec);
  for(let i=0;i<2;i++)expect(await attachSecurity(c,{...sec,issuer_id:'b',isin:'US0378331005'})).toBe('conflict');
  expect(claimKeys(c)).toEqual([{issuer_id:'b',op:'attach_security',id_type:'ticker',value:'AAPL',target_key:'attach_security:b'}]);
  expect(c.rows('issuer_identifier_claims')[0].detail).toMatchObject({target:{issuer_id:'b'},params:{share_class:'common',valid_from:'2000-01-01',valid_from_method:'first_observed',source:'sec',isin:'US0378331005'}});
 });
 it('files no claim without claimEvidence, and no attach claim for a closed incoming window',async()=>{
  const c=client();
  await attachSecurity(c,{...sec,valid_from:'2010-01-01'});
  const {claimEvidence:_ev,...bare}=sec;
  expect(await attachSecurity(c,{...bare,issuer_id:'b',isin:'US0378331005'})).toBe('conflict');
  expect(await attachSecurity(c,{...bare,valid_from:'2010-01-01',isin:'US5949181045'})).toBe('conflict');
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2005-01-01',...closed('2012-01-01'),isin:'US0378331005'})).toBe('conflict');
  expect(c.rows('issuer_identifier_claims')).toEqual([]);
 });
 it('classifies a raced insert by re-reading the overlapping rows',async()=>{
  const same=client();raceInsert(same,'a');
  expect(await attachSecurity(same,sec)).toBe('duplicate');
  const other=client();raceInsert(other,'b');
  expect(await attachSecurity(other,sec)).toBe('conflict');
 });
 it('classifies an exclusion violation (23P01) the same way',async()=>{
  const c=client();raceInsert(c,'b','23P01');
  expect(await attachSecurity(c,sec)).toBe('conflict');
 });
 it('reports duplicate when a concurrent identical closed replay wins the insert',async()=>{
  const c=client();
  const row={...sec,...closed('2010-01-01')};
  const base=c.insert.bind(c);let raced=false;
  c.insert=async(t,r)=>{if(t==='issuer_securities'&&!raced){raced=true;await base(t,r);throw dupErr(t);}return base(t,r);};
  expect(await attachSecurity(c,row)).toBe('duplicate');
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
 it('treats an unexplained 23505 as a replay race but rethrows an unexplained 23P01',async()=>{
  const c=client();
  c.insert=async(t)=>{throw dupErr(t);};
  expect(await attachSecurity(c,sec)).toBe('duplicate');
  c.insert=async(t)=>{throw dupErr(t,'23P01','conflicting key value violates exclusion constraint');};
  await expect(attachSecurity(c,sec)).rejects.toBeInstanceOf(TableError);
 });
 it('reports conflict and files attach_security when another ticker already carries the ISIN',async()=>{
  const c=client();
  const base=c.insert.bind(c);
  c.insert=async(t,row)=>{if(t==='issuer_securities')throw dupErr(t,'23505','duplicate key value violates unique constraint "issuer_securities_isin_idx"');return base(t,row);};
  expect(await attachSecurity(c,{...sec,isin:'US0378331005'})).toBe('conflict');
  expect(claimKeys(c)).toEqual([{issuer_id:'a',op:'attach_security',id_type:'ticker',value:'AAPL',target_key:'attach_security:a'}]);
 });
 it('does the same when the ISIN exclusion (23P01) names issuer_securities_isin_no_overlap',async()=>{
  const c=client();
  const base=c.insert.bind(c);
  c.insert=async(t,row)=>{if(t==='issuer_securities')throw new TableError('insert','issuer_securities','conflicting key value violates exclusion constraint "issuer_securities_isin_no_overlap"','23P01');return base(t,row);};
  expect(await attachSecurity(c,{...sec,isin:'US0378331005'})).toBe('conflict');
  expect(claimKeys(c)).toEqual([{issuer_id:'a',op:'attach_security',id_type:'ticker',value:'AAPL',target_key:'attach_security:a'}]);
  expect(c.rows('issuer_securities')).toEqual([]);
 });
 it('compares the ISIN against same-issuer overlapping rows with a different valid_from',async()=>{
  const c=client();
  expect(await attachSecurity(c,{...sec,isin:'US0378331005'})).toBe('inserted');
  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05',isin:'US0378331005'})).toBe('duplicate');
  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05'})).toBe('duplicate');
  expect(c.rows('issuer_identifier_claims')).toEqual([]);
  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05',isin:'US5949181045'})).toBe('conflict');
  expect(claimKeys(c)).toEqual([{issuer_id:'a',op:'correct_identifier',id_type:'isin',value:'US5949181045',target_key:'correct_identifier:a|AAPL|2000-01-01'}]);
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
 it('writes the window methods: first_observed by default, curated for a curated source, the given one otherwise',async()=>{
  const c=client();
  await attachSecurity(c,sec);
  await attachSecurity(c,{...sec,ticker:'MSFT',source:'curated'});
  await attachSecurity(c,{...sec,ticker:'GOOG',valid_from_method:'listing_date',...closed('2020-01-01')});
  expect(c.rows('issuer_securities').map(r=>[r.ticker,r.valid_from_method,r.valid_to_method])).toEqual([['AAPL','first_observed',null],['MSFT','curated',null],['GOOG','listing_date','unrecorded']]);
 });
 it('refuses a closed window without its method, a method on an open window and unknown methods, before any write',async()=>{
  const c=client();
  await expect(attachSecurity(c,{...sec,valid_to:'2010-01-01'})).rejects.toThrow('invalid_security:valid_to_method');
  await expect(attachSecurity(c,{...sec,valid_to_method:'delisting'})).rejects.toThrow('invalid_security:valid_to_method');
  await expect(attachSecurity(c,{...sec,...closed('2010-01-01'),valid_to_method:'vanished' as never})).rejects.toThrow('invalid_security:valid_to_method');
  await expect(attachSecurity(c,{...sec,valid_from_method:'guessed' as never})).rejects.toThrow('invalid_security:valid_from_method');
  expect(c.rows('issuer_securities')).toEqual([]);
 });
 it('passes provenance through the public whitelist before any write',async()=>{
  const c=client();
  await expect(attachSecurity(c,{...sec,provenance:{exchange:'Nasdaq'}})).rejects.toBeInstanceOf(ProvenanceError);
  await expect(attachSecurity(c,{...sec,provenance:{valid_from:{source:'x',user_id:'u'}}})).rejects.toThrow('provenance_rejected:secret_key');
  expect(c.rows('issuer_securities')).toEqual([]);
  const prov={valid_from:{source:'sec_company_tickers_exchange',as_of:'2026-11-05',row:{exchange:'Nasdaq'}}};
  await attachSecurity(c,{...sec,provenance:prov});
  expect(c.rows('issuer_securities')[0].provenance).toEqual(prov);
 });
 it('maps the inactive-issuer trigger (SQLSTATE 23514) to issuer_not_active and rethrows other check violations',async()=>{
  const c=client();
  c.insert=async(t)=>{throw new TableError('insert',t,'issuer_not_active: issuer a (status merged) cannot hold open security AAPL','23514');};
  await expect(attachSecurity(c,sec)).rejects.toThrow(/^issuer_not_active$/);
  c.insert=async(t)=>{throw new TableError('insert',t,'new row violates check constraint "issuer_securities_window"','23514');};
  await expect(attachSecurity(c,sec)).rejects.toBeInstanceOf(TableError);
 });
});
