import {expect,it} from 'vitest';
import {judgmentsState} from './judgments-state';
import {checkJudgmentsResponse} from '@/lib/company/judgments';
import {toCard} from '@/lib/judgments/display';
import {envelope} from '@/lib/judgments/testing/envelopes';
import {serializeBody} from '@/lib/judgments/route-utils';
const card=serializeBody(toCard(envelope(),{title:{zh:'测试',en:'Test'},now:'2026-06-30T23:59:59.999Z'}));
const fixture={codeVersion:'abc1234',subject:card.subject,view:'latest',asOf:null,cards:[card]};
const check=checkJudgmentsResponse(fixture,null,fixture.subject.key);
const base={flagOn:true,issuerId:'id',asOf:null as string|null,fetch:{status:'ok' as const,data:{}},check};
it('selects off, loading, none and cards',()=>{
 expect(judgmentsState({...base,flagOn:false}).state).toBe('off');
 expect(judgmentsState({...base,issuerId:null}).state).toBe('off');
 for(const status of ['idle','loading'] as const) expect(judgmentsState({...base,fetch:{status}}).state).toBe('loading');
 expect(judgmentsState({...base,check:{ok:true,cards:[]}}).state).toBe('none');
 expect(judgmentsState(base).state).toBe('cards');
});
for(const asOf of [null,'2026-06-30']){
 it(`keeps request failure code when asOf=${asOf}`,()=>expect(judgmentsState({...base,asOf,fetch:{status:'error',code:'down',httpStatus:500}})).toEqual({state:'failed',code:'down'}));
 it.each(['subject_mismatch','malformed','view_mismatch','asof_mismatch','post_cutoff'] as const)(`fails closed for %s when asOf=${asOf}`,reason=>{
  const result=judgmentsState({...base,asOf,check:{ok:false,reason}});
  expect(result).toEqual(asOf?{state:'replayMismatch'}:{state:'failed',code:reason});
 });
}
