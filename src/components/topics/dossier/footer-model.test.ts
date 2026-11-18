// Topic footer provenance and disclosure (spec §7.2, D7–D8).
import {describe,expect,it} from 'vitest';
import {publishedFixture} from '@/lib/topics/fixtures/published';
import {readTopic,readEvidence} from '@/lib/topics/public-read';
import {COUNT_ORDER,footerModel} from './footer-model';
describe('dossier footer',()=>{
 it('orders counts and deduplicates sorted provenance from public details',async()=>{
  const deps={db:publishedFixture().db,preview:false,now:()=>new Date('2026-11-15')};
  const dto=await readTopic(deps,'rates-and-banks',{});
  const details=await Promise.all([1,2,3].map(n=>readEvidence(deps,'rates-and-banks',n,2)));
  const m=footerModel({...dto,details},key=>key);
  expect(m.counts.map(c=>c.state)).toEqual(COUNT_ORDER);
  expect(m.counts.map(c=>c.count)).toEqual(COUNT_ORDER.map(s=>dto.counts[s]));
  expect(m.attributions).toEqual(['attribution.facts:sec','attribution.macro:attribution']);
  expect(m.sources.every(source=>!('relay' in source))).toBe(true);
  expect(m.marketNotes).toEqual(['footer.industry']);expect(m.fredNote).toBe(false);
  dto.expected_slots=[];expect(footerModel(dto,k=>k).marketNotes).toEqual([]);
  dto.evidence[0]={...dto.evidence[0],kind:'financial_fact',state:'withheld'};
  dto.evidence[1]={...dto.evidence[1],state:'not_served'};
  expect(footerModel(dto,k=>k).marketNotes).toEqual(['footer.cn','footer.hk']);
  dto.evidence[0]={...dto.evidence[0],kind:'macro_observation',reason:'licence_unconfirmed'};
  expect(footerModel(dto,k=>k).fredNote).toBe(true);
  dto.evidence[0].reason='catalog_restricted';expect(footerModel(dto,k=>k).fredNote).toBe(true);
 });
});
