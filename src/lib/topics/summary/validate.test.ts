import {expect,it} from 'vitest';
import {ADVICE_TERMS} from '../lexical';
import {validateTopicSummary} from './validate';

const ids=new Set(['ev:1','ev:2']);
const out=(hypothesis:string)=>({points:[{fact_ids:['ev:1'],hypothesis}],counterpoints:[]});
it.each([
 ['利率上升 3 个基点可能压缩息差','numeral',undefined],['未来三个月可能继续','numeral',undefined],['规模可能达到两倍','numeral',undefined],
 [`适合 ${ADVICE_TERMS[9]} 银行股`,'forbidden_term','advice'],[`${ADVICE_TERMS[2]}关注银行`,'forbidden_term','advice'],
 ['经济进入衰退阶段','regime_term',undefined],['十倍空间','numeral',undefined],[`We ${ADVICE_TERMS[11]} banks`,'forbidden_term','advice'],
] as const)('%s → %s',(text,code,detail)=>{
 const r=validateTopicSummary(out(text),ids);
 expect(r.ok).toBe(false);
 if(!r.ok)expect(r.failures).toContainEqual(expect.objectContaining({code,...(detail?{detail}:{})}));
});
it('rejects two sentences in one point',()=>{
 expect(validateTopicSummary(out('息差可能收窄。存款成本可能上升。'),ids)).toMatchObject({ok:false,codes:['multi_sentence']});
});
it('accepts one numberless sentence that cites known facts',()=>{
 expect(validateTopicSummary(out('政策利率维持高位可能压缩银行净息差'),ids).ok).toBe(true);
});
it('rejects an unknown fact id',()=>{
 expect(validateTopicSummary(out('息差可能收窄'),new Set())).toMatchObject({ok:false,codes:['unknown_fact']});
});
