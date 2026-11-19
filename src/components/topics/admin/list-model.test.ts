// Topic plan T5.4: list filters, origins, ordering and creation validation.
import {expect,it} from 'vitest';
import type {TopicsDb} from '@/lib/topics/types';
import {listModel,newTopicErrors} from './list-model';
type Row=Awaited<ReturnType<TopicsDb['adminTopics']>>[number];
const row=(slug:string,extra:Partial<Row>={}):Row=>({topic_id:slug,topic_slug:slug,category:'macro',status:'draft',title:{zh:'专题',en:'Topic'},draft_revision:1,current_version_id:null,current_version_no:null,revised_count:0,promoted:false,retired_at:null,retired_reason:null,created_by:'admin',created_at:'2026-11-16T00:00:00.000Z',...extra});
const rows=[row('z'),row('b',{revised_count:2,promoted:true}),row('a'),row('new',{created_at:'2026-11-17T00:00:00.000Z'}),row('pub',{status:'published'}),row('off',{status:'unpublished'}),row('old',{status:'retired'})];
it('counts all statuses independently of filters',()=>{
 expect(listModel(rows,{status:'draft',revisedOnly:true}).tabs).toEqual({draft:4,published:1,unpublished:1,retired:1});
});
it.each(['draft','published','unpublished','retired'] as const)('filters %s',status=>{
 expect(listModel(rows,{status,revisedOnly:false}).rows.map(r=>r.status)).toEqual(Array(status==='draft'?4:1).fill(status));
});
it('filters revisions and maps the promotion origin',()=>{
 const result=listModel(rows,{status:'draft',revisedOnly:true}).rows;
 expect(result).toHaveLength(1);
 expect(result[0]).toMatchObject({topic_id:'b',slug:'b',origin:'promoted',revised_count:2,current_version_no:null});
 expect(listModel(rows,{status:'draft',revisedOnly:false}).rows.find(r=>r.slug==='a')?.origin).toBeNull();
});
it('sorts newest first then slug ascending without changing the input',()=>{
 const before=structuredClone(rows);
 expect(listModel(rows,{status:'draft',revisedOnly:false}).rows.map(r=>r.slug)).toEqual(['new','a','b','z']);
 expect(rows).toEqual(before);
});
const input={slug:'rates-and-banks',category:'macro',title:{zh:'利率与银行',en:'Rates and banks'}};
it.each(['','ab','Aaa','a_b','a b','-abc','abc-','a--b','a'.repeat(65)])('rejects invalid slug %s',slug=>{
 expect(newTopicErrors({...input,slug})).toEqual({slug:'errors.slug'});
});
it('requires both titles and checks their limits',()=>{
 expect(newTopicErrors({...input,title:{zh:' ',en:''}})).toEqual({'title.zh':'errors.title','title.en':'errors.title'});
 expect(newTopicErrors({...input,title:{zh:'字'.repeat(121),en:'x'.repeat(121)}})).toEqual({'title.zh':'errors.title','title.en':'errors.title'});
});
it('checks category and accepts valid input and slug boundaries',()=>{
 expect(newTopicErrors({...input,category:'other'})).toEqual({category:'errors.category'});
 for(const slug of ['abc','a'.repeat(64),input.slug])expect(newTopicErrors({...input,slug})).toEqual({});
});
it('validates the slug and category without title inputs in promotion mode',()=>{
 expect(newTopicErrors({slug:'new-topic',category:'macro',title:{zh:'',en:''}},false)).toEqual({});
 expect(Object.keys(newTopicErrors({slug:'?',category:'other',title:{zh:'',en:''}},false))).toEqual(['slug','category']);
});
