import {generateKeyPairSync,sign} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {verifyRevocationPage,type FeedCheckpoint,type RevocationPage} from './feed';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now=Date.parse('2026-10-04T00:00:00.000Z');
const checkpoint:FeedCheckpoint={feedId:id(1),scope:{user_id:id(2),workspace_id:null},cursor:'0',latestSeq:'0',publishedAt:null};
const page=():RevocationPage=>({protocol_version:'pa-revocation/v1',feed_id:id(1),owner_scope:checkpoint.scope,from_seq:'0',through_seq:'1',latest_seq:'1',published_at:new Date(now).toISOString(),events:[{revocation_id:id(3),monotonic_seq:'1',source_id:id(4),grant_id:id(5),grant_version:1,effective_at:new Date(now-1000).toISOString()}]});
function check(value:unknown,cp=checkpoint,at=now){const raw=Buffer.from(JSON.stringify(value));return verifyRevocationPage(raw,sign(null,raw,privateKey).toString('hex'),publicKey,cp,at);}
describe('signed revocation pagination contract',()=>{
 it('accepts a signed scoped page without mutating the durable checkpoint',()=>{const result=check(page());expect(result.caughtUp).toBe(true);expect(result.checkpoint.cursor).toBe('1');expect(checkpoint.cursor).toBe('0');});
 it('accepts partial pages but does not call them caught up',()=>{expect(check({...page(),latest_seq:'2'}).caughtUp).toBe(false);});
 it('accepts a signed heartbeat only at the tip',()=>{expect(check({...page(),events:[],through_seq:'0',latest_seq:'0'}).caughtUp).toBe(true);});
 it('handles sequences beyond JS number precision exactly',()=>{const start='9007199254740992',end='9007199254740993';expect(check({...page(),from_seq:start,through_seq:end,latest_seq:end,events:[{...page().events[0],monotonic_seq:end}]},{...checkpoint,cursor:start,latestSeq:start}).checkpoint.cursor).toBe(end);});
 it.each([
  {protocol_version:'other'},{feed_id:id(9)},{owner_scope:{user_id:id(9),workspace_id:null}},
  {owner_scope:{user_id:id(2),workspace_id:id(9)}},{from_seq:'1'},{through_seq:'2'},{latest_seq:'0'},
  {events:[],through_seq:'0',latest_seq:'1'},{events:[{...page().events[0],monotonic_seq:'2'}]},
  {events:[{...page().events[0],grant_version:0}]},{events:[{...page().events[0],effective_at:new Date(now+1).toISOString()}]},
  {events:[{...page().events[0],body:'private material'}]},{latest_seq:'9223372036854775808'},{latest_seq:'01'},
  {published_at:new Date(now-60001).toISOString()},{published_at:new Date(now+5001).toISOString()},
  {published_at:'2026-10-04'},{published_at:'2026-02-30T00:00:00.000Z'},
 ])('rejects invalid signed pages %j',patch=>{expect(()=>check({...page(),...patch})).toThrow('invalid_revocation_page');});
 it('rejects duplicate IDs within a page',()=>{const p=page();expect(()=>check({...p,through_seq:'2',latest_seq:'2',events:[p.events[0],{...p.events[0],monotonic_seq:'2'}]})).toThrow();});
 it('rejects replay after the cursor has committed',()=>{expect(()=>check(page(),check(page()).checkpoint)).toThrow();});
 it('rejects authority watermark regression',()=>{expect(()=>check(page(),{...checkpoint,latestSeq:'2'})).toThrow();expect(()=>check(page(),{...checkpoint,publishedAt:new Date(now+1).toISOString()})).toThrow();});
 it('rejects untrusted signatures and byte tampering',()=>{const raw=Buffer.from(JSON.stringify(page()));const signature=sign(null,raw,privateKey).toString('hex');expect(()=>verifyRevocationPage(Buffer.concat([raw,Buffer.from(' ')]),signature,publicKey,checkpoint,now)).toThrow();expect(()=>verifyRevocationPage(raw,signature,generateKeyPairSync('ed25519').publicKey,checkpoint,now)).toThrow();});
 it('rejects oversized transport and wrong key type',()=>{expect(()=>verifyRevocationPage(Buffer.alloc(65537),'0'.repeat(128),publicKey,checkpoint,now)).toThrow();expect(()=>verifyRevocationPage(Buffer.from('{}'),'0'.repeat(128),privateKey,checkpoint,now)).toThrow();});
 it('rejects non-integral and invalid local clock values',()=>{expect(()=>check(page(),checkpoint,NaN)).toThrow();expect(()=>check(page(),checkpoint,now+0.5)).toThrow();});
});
it('rejects a corrupted checkpoint and accepts matching workspace scope',()=>{
 expect(()=>check(page(),{...checkpoint,cursor:'1',latestSeq:'0'})).toThrow();
 const scope={...checkpoint.scope,workspace_id:id(8)};expect(check({...page(),owner_scope:scope},{...checkpoint,scope}).caughtUp).toBe(true);
});
it('accepts the maximum PostgreSQL sequence without rounding',()=>{
 const start='9223372036854775806',end='9223372036854775807';expect(check({...page(),from_seq:start,through_seq:end,latest_seq:end,events:[{...page().events[0],monotonic_seq:end}]},{...checkpoint,cursor:start,latestSeq:start}).checkpoint.cursor).toBe(end);
});
it('rejects signed duplicate JSON keys and 101 events',()=>{
 const raw=Buffer.from(JSON.stringify(page()).replace('"from_seq":"0"','"from_seq":"0","from_seq":"0"'));
 expect(()=>verifyRevocationPage(raw,sign(null,raw,privateKey).toString('hex'),publicKey,checkpoint,now)).toThrow();
 expect(()=>check({...page(),through_seq:'101',latest_seq:'101',events:Array.from({length:101},(_,i)=>({...page().events[0],revocation_id:id(i+100),monotonic_seq:String(i+1)}))})).toThrow();
});
it('accepts exact byte limit with signed whitespace but rejects one more byte',()=>{
 const body=JSON.stringify(page());const raw=Buffer.from(body+' '.repeat(65536-Buffer.byteLength(body)));
 expect(verifyRevocationPage(raw,sign(null,raw,privateKey).toString('hex'),publicKey,checkpoint,now).caughtUp).toBe(true);
 const oversized=Buffer.concat([raw,Buffer.from(' ')]);expect(()=>verifyRevocationPage(oversized,sign(null,oversized,privateKey).toString('hex'),publicKey,checkpoint,now)).toThrow();
});
it('does not renew a heartbeat publication time on replay',()=>{
 const heartbeat={...page(),events:[],through_seq:'0',latest_seq:'0'};const cp=check(heartbeat).checkpoint;
 expect(check(heartbeat,cp,now+60000).checkpoint.publishedAt).toBe(cp.publishedAt);
 expect(()=>check(heartbeat,cp,now+60001)).toThrow();
});

it('accepts a shared event/publication instant but rejects a one millisecond construction race',()=>{
 const p=page();p.events[0].effective_at=p.published_at;
 expect(check(p).caughtUp).toBe(true);
 p.events[0].effective_at=new Date(now+1).toISOString();
 // Both timestamps are in the past at verification: this is ordering, not future clock skew.
 expect(()=>check(p,checkpoint,now+1000)).toThrow('invalid_revocation_page');
});

it('rejects uppercase event UUID while the otherwise identical lowercase page passes',()=>{
 const p=page();p.events[0].effective_at=p.published_at;
 p.events[0].source_id='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
 expect(()=>check(p)).toThrow('invalid_revocation_page');
 p.events[0].source_id=p.events[0].source_id.toLowerCase();
 expect(check(p).caughtUp).toBe(true);
});
