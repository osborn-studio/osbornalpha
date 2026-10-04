import {it,expect} from 'vitest';
import {assertRevocationFresh} from './freshness';
import type {FeedCheckpoint} from './feed';
const now=Date.parse('2026-10-04T00:00:00.000Z');
const checkpoint:FeedCheckpoint={feedId:'10000000-0000-4000-8000-000000000001',scope:{user_id:'10000000-0000-4000-8000-000000000002',workspace_id:null},cursor:'8',latestSeq:'8',publishedAt:new Date(now).toISOString()};
it('allows a fresh committed tip then rejects that same checkpoint after expiry',()=>{
 expect(()=>assertRevocationFresh(checkpoint,checkpoint,now+60000)).not.toThrow();expect(()=>assertRevocationFresh(checkpoint,checkpoint,now+60001)).toThrow('revocation_unavailable');
});
it.each([null,{...checkpoint,publishedAt:null},{...checkpoint,latestSeq:'9'},{...checkpoint,latestSeq:'7'},{...checkpoint,cursor:'08'},{...checkpoint,cursor:'9223372036854775808',latestSeq:'9223372036854775808'},{...checkpoint,publishedAt:'2026-10-04'},{...checkpoint,publishedAt:'invalid'}])('fails closed for missing, lagging or corrupt checkpoints',value=>{expect(()=>assertRevocationFresh(value,checkpoint,now)).toThrow('revocation_unavailable');});
it.each([NaN,Infinity,-1,now+0.5,now-5001])('rejects invalid local clock or excessive rollback',at=>{expect(()=>assertRevocationFresh(checkpoint,checkpoint,at)).toThrow('revocation_unavailable');});
it('permits only the documented five-second forward skew allowance',()=>{expect(()=>assertRevocationFresh(checkpoint,checkpoint,now-5000)).not.toThrow();});
it('supports exact bigint tip equality',()=>{expect(()=>assertRevocationFresh({...checkpoint,cursor:'9223372036854775807',latestSeq:'9223372036854775807'},checkpoint,now)).not.toThrow();});

it.each([{...checkpoint,feedId:'different'},{...checkpoint,scope:{...checkpoint.scope,user_id:'different'}},{...checkpoint,scope:{...checkpoint.scope,workspace_id:'10000000-0000-4000-8000-000000000003'}}])('rejects a fresh checkpoint from a different expected scope or epoch',expected=>{expect(()=>assertRevocationFresh(checkpoint,expected,now)).toThrow('revocation_unavailable');});
it('compares workspace scopes in both directions and accepts exact matches',()=>{
 const scoped={...checkpoint,scope:{...checkpoint.scope,workspace_id:'10000000-0000-4000-8000-000000000003'}};
 expect(()=>assertRevocationFresh(scoped,checkpoint,now)).toThrow();expect(()=>assertRevocationFresh(scoped,scoped,now)).not.toThrow();
});
