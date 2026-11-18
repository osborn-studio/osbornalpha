import {expect,it,vi} from 'vitest';
import {probeInboxPerIssuer,mergeInboxRows,shouldProbeNow} from './inbox-degrade';
it('retains successful issuers when one fails',async()=>{
 const result=await probeInboxPerIssuer({issuerIds:['a','b','c'],fetchOne:async id=>{if(id==='b')throw {code:'down'};return [id];}});
 expect(result.status).toBe('partial');
 if(result.status==='unavailable')throw Error('unexpected');
 expect([...result.perIssuer]).toEqual([['a',{state:'ok',rows:['a']}],['b',{state:'unavailable',code:'down'}],['c',{state:'ok',rows:['c']}]]);
});
it('stops after a failed first batch',async()=>{
 const fetchOne=vi.fn(async()=>{throw {code:'offline'};});
 expect(await probeInboxPerIssuer({issuerIds:['a','b','c','d','e'],concurrency:2,fetchOne})).toEqual({status:'unavailable',code:'offline'});
 expect(fetchOne).toHaveBeenCalledTimes(2);
});
it('returns ok and bounds concurrency',async()=>{
 let active=0,max=0;
 const result=await probeInboxPerIssuer({issuerIds:['a','b','c','d','e','f','g'],concurrency:2,fetchOne:async id=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return [id];}});
 expect(result.status).toBe('ok');expect(max).toBe(2);
});
it('merges only successful rows, newest first with descending id ties',()=>{
 const a={eventId:'a',firstSeenAt:'2026-01-02'},b={eventId:'b',firstSeenAt:'2026-01-02'},c={eventId:'c',firstSeenAt:'2026-01-01'};
 expect(mergeInboxRows(new Map([['a',{state:'ok' as const,rows:[c,a]}],['b',{state:'ok' as const,rows:[b]}],['c',{state:'unavailable' as const,code:'down'}]]))).toEqual([b,a,c]);
});
it('sorts missing first-seen times last without inventing dates',()=>{
 const rows=[{eventId:'z',firstSeenAt:null},{eventId:'a',firstSeenAt:'2026-01-01'}];
 expect(mergeInboxRows(new Map([['a',{state:'ok',rows}]]))).toEqual([rows[1],rows[0]]);
 expect(mergeInboxRows(new Map([['a',{state:'ok',rows:[...rows].reverse()}]]))).toEqual([rows[1],rows[0]]);
});


const failedFirstPage = {
 generation: 7,
 scope: 'all|all|false',
 cursor: null,
 issuer: null,
 probeStarted: false,
};
const probeDecision = {
 failure: failedFirstPage,
 generation: 7,
 scope: 'all|all|false',
 activeWatchCount: 2,
};

it('probes a failed combined first page once watches arrive after the failure',()=>{
 expect(shouldProbeNow({...probeDecision,activeWatchCount:0})).toBe(false);
 expect(shouldProbeNow(probeDecision)).toBe(true);
});
it('does not probe before a combined request has failed',()=>{
 expect(shouldProbeNow({...probeDecision,failure:null})).toBe(false);
});
it('does not double probe while the per-company request is in flight',()=>{
 expect(shouldProbeNow({...probeDecision,failure:{...failedFirstPage,probeStarted:true}})).toBe(false);
});
it('does not loop after a probe returned unavailable and watches refresh',()=>{
 const attempted={...failedFirstPage,probeStarted:true};
 expect(shouldProbeNow({...probeDecision,failure:attempted,activeWatchCount:3})).toBe(false);
});
it('ignores failed requests from an older generation or different scope',()=>{
 expect(shouldProbeNow({...probeDecision,generation:8})).toBe(false);
 expect(shouldProbeNow({...probeDecision,scope:'all|filing|false'})).toBe(false);
});
it('does not probe a failed cursor page or single-company request',()=>{
 expect(shouldProbeNow({...probeDecision,failure:{...failedFirstPage,cursor:'next-page'}})).toBe(false);
 expect(shouldProbeNow({...probeDecision,failure:{...failedFirstPage,issuer:'issuer-a'}})).toBe(false);
});
