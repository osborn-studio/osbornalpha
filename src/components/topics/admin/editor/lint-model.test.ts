// Topic plan T5.5: artboard findings and client-safe fixes.
import {expect,it} from 'vitest';
import {lintField} from './lint-field';
import {attachFixes,findingsByField} from './lint-model';
const evidence=[{ordinal:1,state:'ok',text:'3.75%'},{ordinal:2,state:'ok',text:'4.3%'}];
it('returns the three artboard findings in order',()=>{
 expect(lintField('截至 {{ev:1.period}}，联邦基金有效利率为 {{ev:1}}。失业率为 4.3%，我们建议关注银行息差。见 {{ev:14}}。',evidence)).toEqual([
  {code:'numeral_in_owner_text',match:'4.3%',fix:{ordinal:2}},{code:'advice_term',match:'建议'},{code:'dangling_slot',match:'{{ev:14}}'},
 ]);
});
it('attaches only unambiguous public values',()=>{
 const findings=[{code:'numeral_in_owner_text' as const,match:'4.3%'}];
 expect(attachFixes(findings,evidence)[0].fix).toEqual({ordinal:2});
 expect(attachFixes(findings,[...evidence,{ordinal:3,state:'ok',text:'4.3%'}])).toEqual(findings);
 expect(attachFixes(findings,[{ordinal:2,state:'withheld',text:'4.3%'}])).toEqual(findings);
});
it('groups findings by field without pulling in the server validator',()=>{
 expect(findingsByField([{field:'dek.zh',code:'numeral_in_owner_text',match:'4.3%'},{field:'title.en',code:'dangling_slot',match:'{{ev:9}}'}],evidence)).toEqual({'dek.zh':[{code:'numeral_in_owner_text',match:'4.3%',fix:{ordinal:2}}],'title.en':[{code:'dangling_slot',match:'{{ev:9}}'}]});
});
