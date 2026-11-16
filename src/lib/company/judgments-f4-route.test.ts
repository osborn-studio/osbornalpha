import {describe,expect,it,vi} from 'vitest';
import {memoryJudgmentsDb} from '@/lib/judgments/memory-judgments-db';
import {startBatch} from '@/lib/dq/batches';
import {judgmentFixture,methodologyFixture} from '@/lib/judgments/db-contract';
import {visiblePercent} from '@/components/judgments/view-model';
import {checkJudgmentsResponse,displayPercent,judgmentsUrl} from './judgments';

let db=memoryJudgmentsDb();
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));
import {GET} from '@/app/api/judgments/route';

const issuer='11111111-1111-4111-8111-111111111111';
const route=async(asOf:string|null)=>GET(new Request(`https://alpha.example${judgmentsUrl(issuer,asOf)}`));
async function seededRoute(){
 const db=memoryJudgmentsDb();db.setNow('2026-03-01T00:00:00.000Z');db.addIssuer(issuer);
 const method=methodologyFixture({publishable:true});await db.syncMethodology(method,'script',null);
 const batch=await startBatch(db.tables,{producer:'ts-judgments',dataset:'judgments.ztest'});
 const fixture=judgmentFixture(method,batch.batchId,{subject:{type:'issuer',key:issuer},as_of:'2026-03-01'});
 await db.registerJudgment(fixture.row,fixture.queue);return db;
}

describe('company consumes the real F4 list route',()=>{
 it('parses the route JSON over F4 DB contract for latest and as_known',async()=>{
  db=await seededRoute();
  for(const asOf of [null,'2026-03-01']){
   const response=await route(asOf);
   expect(response.status).toBe(200);
   const parsed=checkJudgmentsResponse(await response.json(),asOf,issuer);
   expect(parsed.ok).toBe(true);
   if(parsed.ok){expect(parsed.cards).toHaveLength(1);expect(displayPercent(parsed.cards[0])).toBeNull();expect(visiblePercent(parsed.cards[0])).toBeNull();}
  }
  const before=await route('2026-02-28');
  expect(checkJudgmentsResponse(await before.json(),'2026-02-28',issuer)).toEqual({ok:true,cards:[]});
 });
 it('rejects a real route card with incompatible F4 fields',async()=>{
  db=await seededRoute();
  const body=await (await route(null)).json();
  body.cards[0].subject.key=42;
  expect(checkJudgmentsResponse(body,null,issuer)).toEqual({ok:false,reason:'malformed'});
 });
});
