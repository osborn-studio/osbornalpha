import {PROMOTION_COUNT_COLUMNS,type ThesisReader} from '../promote';
const thesisId='00000000-0000-4000-8000-000000000abc';
export const fixturePrivateIds=()=>new Set([thesisId]);
export const fixtureThesis:ThesisReader={
 copy:async id=>id===thesisId?{title:'Liquidity',body:'Liquidity changed by 3'}:null,
 counts:async id=>id===thesisId?Object.fromEntries(PROMOTION_COUNT_COLUMNS.split(',').map(field=>[field,0])):null,
};
