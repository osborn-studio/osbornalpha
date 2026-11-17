// Topic spec §4.1 resolver tests.
import {expect,it} from 'vitest';
import {memorySources} from '../memory-sources';
import {industryResolver} from './industry';
import {industryFixture,CELL,RUN} from '../fixtures/industry';
const pub={audience:'public' as const,now:new Date('2026-11-15T00:00:00Z'),locale:'zh' as const};
it.each([
 ['an ok cell of the active reconstruction run',CELL.sicOk,'ok',null,'reconstruction'],
 ['an ok cell of a superseded point-in-time run activated before as_of',CELL.swSuperseded,'ok',null,'point_in_time'],
 ['an unknown run',CELL.unknownRun,'missing','not_found',null],
 ['a run still building',CELL.building,'missing','run_not_active',null],
 ['a run activated after as_of',CELL.activatedLater,'missing','run_not_active',null],
 ['a dataset that is not public',CELL.swInternal,'withheld','unlicensed',null],
 ['a cell absent from the run',CELL.noRow,'missing','not_found',null],
 ['a missing cell',CELL.zeroDenominator,'missing','zero_denominator',null],
] as const)('%s → %s:%s',async(_n,id,state,reason,basis)=>{
 const [out]=await industryResolver(memorySources(industryFixture())).resolve([{v:1,kind:'industry_metric',id,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect([out.state,out.reason,out.basis]).toEqual([state,reason,basis]);
});
it('carries the member counts as slots and never a value when withheld',async()=>{
 const res=industryResolver(memorySources(industryFixture()));
 const [okCell]=await res.resolve([{v:1,kind:'industry_metric',id:CELL.sicOk,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect(okCell.display.fact?.slots).toMatchObject({value:{value_text:'0.201',unit:'ratio'},n_with_data:'41',n_members:'52'});
 const [held]=await res.resolve([{v:1,kind:'industry_metric',id:CELL.swInternal,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect(JSON.stringify(held)).not.toContain('0.333');
});
it('returns null as latest identity when the run was deleted',async()=>{
 const src=memorySources(industryFixture());src.seed.industry.cells=src.seed.industry.cells.filter(c=>c.key.run_id!==RUN.sic);
 expect(await industryResolver(src).latestIdentity({v:1,kind:'industry_metric',id:CELL.sicOk,as_of:'2026-11-14T00:00:00.000Z'})).toBeNull();
});
it('keeps the full cell identity for drift and follows a replacement active run',async()=>{
 const src=memorySources(industryFixture()),res=industryResolver(src);
 const ref={v:1 as const,kind:'industry_metric' as const,id:CELL.sicOk,as_of:'2026-11-14T00:00:00.000Z'};
 expect(await res.latestIdentity(ref)).toMatchObject({object_id:CELL.sicOk,value:{value_text:'0.201'}});
 const old=src.seed.industry.cells.find(c=>c.key.run_id===RUN.sic)!;
 old.run.status='superseded';
 const run_id='20000000-0000-4000-8000-000000000088';
 src.seed.industry.cells.push({...old,key:{...old.key,run_id},run:{...old.run,run_id,status:'active',generation:2},row:{...old.row!,value_text:'0.222'}});
 expect(await res.latestIdentity(ref)).toMatchObject({object_id:CELL.sicOk.replace(RUN.sic,run_id),value:{value_text:'0.222'}});
 expect((await res.resolve([ref],pub))[0].display.fact?.slots.value).toEqual({value_text:'0.201',unit:'ratio'});
});
