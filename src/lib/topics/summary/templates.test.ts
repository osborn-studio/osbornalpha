import {expect,it} from 'vitest';
import type {Fact} from '@/lib/macro/strategy/contract';
import {TEMPLATES,registerTemplates,renderFact} from '@/lib/macro/strategy/explain-render';
import './templates';

const slots={series:'rate',period:'June',prev_period:'May',value:{value_text:'2',unit:'pct'},change:{value_text:'1',unit:'pp'},
 company:'Issuer',concept:'Revenue',metric:'Margin',industry:'Banks',n_with_data:'4',n_members:'5',basis:'reconstruction',
 title:'Report',page:'7',snippet:'Restricted fragment 98342',method:'method'};
const samples=[
 ['macro_level','June 利率为 2%','Rate was 2% in June'],
 ['macro_change','利率 June 较 May 变化 +1 个百分点。','Rate changed by +1 pp from May to June.'],
 ['fact_value','Issuer June Revenue为 2%','Issuer Revenue was 2% in June'],
 ['industry_value','June Banks Margin为 2%（4/5 家有数据）（重建口径）','Banks Margin was 2% in June (4/5 members with data) (reconstruction)'],
 ['citation','见《Report》第 7 页','See Report, page 7'],
 ['judgment_ref','见 F4 判断卡 method','See F4 judgment card method'],
];
it('covers all topic templates',()=>{
 expect(Object.keys(TEMPLATES).filter(id=>id.startsWith('topic.')).sort()).toEqual(samples.map(([id])=>'topic.'+id).sort());
});
it.each(samples)('renders %s from the allowed slots in both locales',(id,zh,en)=>{
 const f:Fact={fact_id:'ev:1',kind:'level',source_inputs:[],template:'topic.'+id,slots};
 const names=(key:string)=>key==='rate'?{zh:'利率',en:'Rate'}:null;
 expect(renderFact(f,'zh',names)).toBe(zh);
 expect(renderFact(f,'en',names)).toBe(en);
});
it('rejects unqualified and duplicate ids before merging',()=>{
 expect(()=>registerTemplates('topic',{level:TEMPLATES.level})).toThrow();
 expect(()=>registerTemplates('topic',{'topic.extra':TEMPLATES.level,'topic.citation':TEMPLATES.level})).toThrow();
 expect(TEMPLATES['topic.extra']).toBeUndefined();
});
it.each(['USD','USD/share','shares'])('retains a financial value’s frozen %s unit',unit=>{
 const fact:Fact={fact_id:'ev:2',kind:'level',source_inputs:[],template:'topic.fact_value',
  slots:{...slots,value:{value_text:'1000',unit}}};
 expect(renderFact(fact,'en',()=>null)).toContain('1,000 '+unit);
});
