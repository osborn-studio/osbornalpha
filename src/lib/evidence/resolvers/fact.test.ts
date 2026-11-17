// Topic spec §4.1 resolver tests.
import {expect,it} from 'vitest';
import {memorySources} from '../memory-sources';
import {factResolver} from './fact';
import {factFixture,FACT} from '../fixtures/facts';
const pub={audience:'public' as const,now:new Date('2026-11-15T00:00:00Z'),locale:'zh' as const};
it.each([
 ['a US fact with complete evidence',FACT.usOk,'ok',null],
 ['an unknown id',FACT.unknown,'missing','not_found'],
 ['a Hong Kong fact',FACT.hk,'not_served','hk_not_served'],
 ['a quarantined fact',FACT.quarantined,'retracted','quarantined'],
 ['a staged fact',FACT.staged,'missing','not_found'],
 ['a fact not yet available at as_of',FACT.usLater,'missing','not_yet_available'],
 ['a CN fact whose citation is pending',FACT.cnPending,'withheld','citation_pending'],
 ['a US fact with incomplete evidence',FACT.usIncomplete,'withheld','evidence_incomplete'],
] as const)('%s → %s:%s',async(_n,id,state,reason)=>{
 const [out]=await factResolver(memorySources(factFixture())).resolve([{v:1,kind:'financial_fact',id,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect([out.state,out.reason]).toEqual([state,reason]);
});
it('A6: the CN value appears nowhere in the serialised public result',async()=>{
 const out=await factResolver(memorySources(factFixture())).resolve([{v:1,kind:'financial_fact',id:FACT.cnPending,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect(JSON.stringify(out)).not.toContain('987654321.12');
});
it('shows the CN value to an admin only with the admin_only mark',async()=>{
 const [out]=await factResolver(memorySources(factFixture())).resolve([{v:1,kind:'financial_fact',id:FACT.cnPending,as_of:'2026-11-14T00:00:00.000Z'}],{...pub,audience:'admin'});
 expect([out.state,out.admin_only,(out.display.fact?.slots.value as {value_text:string}).value_text]).toEqual(['ok',true,'987654321.12']);
});
it('reports a restated value as the latest identity',async()=>{
 expect(await factResolver(memorySources(factFixture())).latestIdentity({v:1,kind:'financial_fact',id:FACT.usOk,as_of:'2026-11-14T00:00:00.000Z'}))
  .toMatchObject({state:'ok',object_id:FACT.usRestated,value:{value_text:'1010'}});
});
it('keeps incomplete evidence withheld for admins and hides ineligible current values',async()=>{
 const src=memorySources(factFixture()),res=factResolver(src);
 const ref={v:1 as const,kind:'financial_fact' as const,id:FACT.usIncomplete,as_of:'2026-11-14T00:00:00.000Z'};
 const [held]=await res.resolve([ref],{...pub,audience:'admin'});
 expect([held.state,held.reason,held.admin_only]).toEqual(['withheld','evidence_incomplete',undefined]);
 expect(JSON.stringify(held)).not.toContain('8888.88');
 src.seed.facts.ineligible.set(FACT.usRestated,'evidence_incomplete');
 expect(await res.latestIdentity({...ref,id:FACT.usOk})).toMatchObject({state:'ok',object_id:FACT.usRestated,value:null});
 src.seed.facts.ineligible.set(FACT.usOk,'evidence_incomplete');
 expect(await res.latestIdentity({...ref,id:FACT.usOk})).toMatchObject({state:'withheld',reason:'evidence_incomplete',value:null});
 src.seed.facts.infos.find(i=>i.row.fact_id===FACT.usOk)!.row.status='quarantined';
 expect(await res.latestIdentity({...ref,id:FACT.usOk})).toMatchObject({state:'retracted',reason:'quarantined',value:null});
});
