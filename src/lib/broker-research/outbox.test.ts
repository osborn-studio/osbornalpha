// src/lib/broker-research/outbox.test.ts
import {describe,expect,it,vi} from 'vitest';
import {deliverOutbox,validateOutboxEvent} from './outbox';
import {disabledF4Port,productionF4Port} from './ports/f4';
import type {F4Port} from './ports/f4';
import type {BrokerResearchDb,OutboxEvent} from './types';

const PUB='33333333-3333-4333-8333-333333333333';
const ev=(o:Partial<OutboxEvent>={},p:Record<string,unknown>={}):OutboxEvent=>({event_id:'e1',kind:'claim.register',status:'pending',attempts:0,last_error:null,created_at:'',delivered_at:null,
 payload:{claim_key:`broker_target_price:${PUB}:600000.SH`,claim_seq:1,claim_type:'broker_target_price',methodology_version:'broker-claim/1',source:{publication_id:PUB,report_id:'r'},visibility_ref:{view:'broker_report_targets_public_v',report_id:'r',target_key:'600000.SH'},...p},...o});
const dbOf=(events:OutboxEvent[])=>({takePendingOutbox:vi.fn().mockResolvedValue(events),markOutbox:vi.fn().mockResolvedValue(undefined)}) as unknown as BrokerResearchDb&{takePendingOutbox:ReturnType<typeof vi.fn>;markOutbox:ReturnType<typeof vi.fn>};
const now=()=>new Date('2026-11-06T00:00:00Z'),deadline=new Date('2026-11-06T00:01:00Z');

describe('validateOutboxEvent',()=>{
 it('accepts the §10.2 shapes and names the first bad field',()=>{
  expect(validateOutboxEvent(ev())).toBeNull();
  expect(validateOutboxEvent(ev({kind:'claim.retract'},{claim_seq:2}))).toBeNull();
  expect(validateOutboxEvent(ev({},{claim_seq:2}))).toBe('claim_seq');
  expect(validateOutboxEvent(ev({},{claim_key:'broker_target_price:nope'}))).toBe('claim_key');
  expect(validateOutboxEvent(ev({},{methodology_version:'x'}))).toBe('methodology_version');
  expect(validateOutboxEvent(ev({},{source:{publication_id:'44444444-4444-4444-8444-444444444444'}}))).toBe('source');
  expect(validateOutboxEvent(ev({kind:'licence.changed'},{}))).toBeNull();
 });
});

describe('deliverOutbox',()=>{
 it('caps each invocation at 50 events even when a caller requests more',async()=>{
  const events=Array.from({length:60},(_,i)=>ev({event_id:`e${i}`}));
  const db=dbOf(events);
  db.takePendingOutbox.mockImplementation(async(limit:number)=>events.slice(0,limit));
  const f4:F4Port={enabled:true,deliver:vi.fn().mockResolvedValue({ok:true,accepted:true,applied:true,claimId:null})};
  expect(await deliverOutbox({db,f4,now},{limit:100,deadline})).toMatchObject({taken:50,delivered:50,failed:0});
  expect(db.takePendingOutbox).toHaveBeenCalledWith(50);
  expect(f4.deliver).toHaveBeenCalledTimes(50);
 });
 it('F4 disabled: reads nothing, changes nothing',async()=>{
  const db=dbOf([ev()]);
  expect(await deliverOutbox({db,f4:disabledF4Port,now},{limit:50,deadline})).toEqual({skipped:'f4_disabled',taken:0,delivered:0,failed:0});
  expect(db.takePendingOutbox).not.toHaveBeenCalled();expect(db.markOutbox).not.toHaveBeenCalled();
 });
 it('marks delivered, failed and invalid events',async()=>{
  const db=dbOf([ev({event_id:'a'}),ev({event_id:'b'}),ev({event_id:'c'},{claim_seq:9})]);
  const f4:F4Port={enabled:true,deliver:vi.fn().mockResolvedValueOnce({ok:true,accepted:true,applied:true,claimId:'k'}).mockResolvedValueOnce({ok:false,error:'http_503'})};
  expect(await deliverOutbox({db,f4,now},{limit:50,deadline})).toEqual({skipped:null,taken:3,delivered:1,failed:2});
  expect(db.markOutbox.mock.calls).toEqual([['a',{delivered:true}],['b',{delivered:false,error:'http_503'}],['c',{delivered:false,error:'payload_invalid:claim_seq'}]]);
  expect(f4.deliver).toHaveBeenCalledTimes(2);
 });
});

describe('productionF4Port',()=>{
 it('is disabled without a usable URL',()=>{
  expect(productionF4Port({}).enabled).toBe(false);expect(productionF4Port({BROKER_RESEARCH_F4_URL:'http://f4.example'}).enabled).toBe(false);expect(productionF4Port({BROKER_RESEARCH_F4_URL:'::'}).enabled).toBe(false);
 });
 it('POSTs the event to /claims/events with the bearer and maps responses',async()=>{
  const fetchImpl=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({accepted:true,applied:false}),{status:200})).mockResolvedValueOnce(new Response('',{status:500})).mockRejectedValueOnce(Object.assign(new Error('t'),{name:'TimeoutError'}));
  const p=productionF4Port({BROKER_RESEARCH_F4_URL:'https://f4.example/api',BROKER_RESEARCH_F4_TOKEN:'tok'},fetchImpl as unknown as typeof fetch);
  expect(await p.deliver(ev())).toEqual({ok:true,accepted:true,applied:false,claimId:null});
  const [url,init]=fetchImpl.mock.calls[0];
  expect(String(url)).toBe('https://f4.example/api/claims/events');expect(init.headers).toMatchObject({authorization:'Bearer tok','content-type':'application/json'});
  expect(JSON.parse(init.body)).toMatchObject({event_id:'e1',kind:'claim.register',claim_seq:1});
  expect(await p.deliver(ev())).toEqual({ok:false,error:'http_500'});expect(await p.deliver(ev())).toEqual({ok:false,error:'f4_timeout'});
 });
});
