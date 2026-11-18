// Version controls (topic spec §7.2, A15).
import {describe,expect,it} from 'vitest';
import {readTopic,readVersions} from '@/lib/topics/public-read';
import {publishedFixture} from '@/lib/topics/fixtures/published';
import {versionBarModel} from './version-bar-model';
describe('version bar',()=>{
 it('formats chips, sorts known versions and disables unpublished versions',async()=>{
  const deps={preview:false,db:publishedFixture().db,now:()=>new Date('2026-11-15T00:00:00Z')};
  const dto=await readTopic(deps,'rates-and-banks',{}),versions=await readVersions(deps,'rates-and-banks');
  versions[1].unpublished_at='2026-11-14';versions[1].unpublish_reason='error';
  const m=versionBarModel(dto,{isAdmin:true,today:'2026-11-15',versions:versions.reverse()});
  expect(m.chips).toEqual(['v2 · 当前','发布 2026-11-08','证据截至 2026-11-01 00:00 UTC']);
  expect(m.options).toEqual([{value:2,label:'v2 · 当前',disabled:false,href:'/intel/topics/rates-and-banks'},{value:1,label:'v1 · 已取消发布',disabled:true,href:'/intel/topics/rates-and-banks/v/1'}]);
  expect(m.adminHref).toBe('/admin/topics');expect(m.maxDate).toBe('2026-11-15');
  expect(m.totalText).toBe('共 2 版');
  expect(versionBarModel(dto,{isAdmin:false,today:'2026-11-15'}).adminHref).toBeNull();
 });
 it('shows drift warning only when unchecked and localizes the bar',async()=>{
  const dto=await readTopic({preview:false,db:publishedFixture().db,now:()=>new Date('2026-11-15T00:00:00Z')},'rates-and-banks',{});
  dto.drift_unchecked=true;dto.drift_checked_at='2026-11-10T12:30:00.000Z';
  expect(versionBarModel(dto,{isAdmin:false,today:'2026-11-15'}).driftChip).toEqual({text:'证据状态未能核对',checkedText:'漂移检查截至 2026-11-10 12:30 UTC'});
  dto.drift_unchecked=false;
  const m=versionBarModel(dto,{isAdmin:false,today:'2026-11-15',locale:'en'});
  expect(m.driftChip).toBeNull();expect(m.chips[0]).toBe('v2 · Current');
 });
});
