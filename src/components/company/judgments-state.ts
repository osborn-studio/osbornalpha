import type {FetchState} from './useCompanyFetch';
import type {JudgmentCardDto,JudgmentsCheck} from '@/lib/company/judgments';
export type JudgmentsState = {state:'off'|'none'|'loading'|'replayMismatch'} | {state:'failed';code:string} | {state:'cards';cards:JudgmentCardDto[]};
export function judgmentsState({flagOn,issuerId,asOf,fetch,check}:{flagOn:boolean;issuerId:string|null;asOf:string|null;fetch:FetchState<unknown>;check:JudgmentsCheck|null}):JudgmentsState {
  if(!flagOn||!issuerId)return {state:'off'};
  if(fetch.status==='idle'||fetch.status==='loading')return {state:'loading'};
  if(fetch.status==='error')return {state:'failed',code:fetch.code};
  if(!check)return {state:'failed',code:'malformed'};
  if(!check.ok)return asOf?{state:'replayMismatch'}:{state:'failed',code:check.reason};
  return check.cards.length?{state:'cards',cards:check.cards}:{state:'none'};
}
