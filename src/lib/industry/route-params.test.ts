// src/lib/industry/route-params.test.ts
import {describe,expect,it,vi} from 'vitest';
vi.mock('./memberships',()=>({isMemberAt:()=>true}));
vi.mock('./replay',()=>({replayFromManifest:()=>({cells:[]})}));
import {QueryError} from '../facts/public-route';
import {clientIp,codeOf,createRateLimiter,durationOf,levelOf,metricOf,metricsOf,onOf,schemeOf,uuidOf,versionOf,windowOf} from './route-params';

const P=(o:Record<string,string>)=>new Map(Object.entries(o));
const bad=(f:()=>unknown,param:string)=>{try{f();}catch(e){expect(e).toBeInstanceOf(QueryError);expect((e as QueryError).param).toBe(param);return;}throw new Error('no QueryError');};

describe('industry route parameters',()=>{
 it('scheme, version, level',()=>{
  expect(schemeOf('sic')).toBe('sic');bad(()=>schemeOf('gics'),'scheme');
  expect(versionOf(P({}),'sw2021')).toBe('2021');expect(versionOf(P({version:'sec-current'}),'sic')).toBe('sec-current');bad(()=>versionOf(P({version:'2014'}),'sw2021'),'version');
  expect(levelOf(P({}),'sw2021')).toBe(1);expect(levelOf(P({level:'3'}),'sw2021')).toBe(3);bad(()=>levelOf(P({level:'4'}),'sw2021'),'level');bad(()=>levelOf(P({level:'2'}),'sic'),'level');
 });
 it('metric and duration follow spec §5.2 (gross_margin 12M only, roe TTM, member_count INSTANT)',()=>{
  expect(metricOf(P({}))).toBe('gross_margin');bad(()=>metricOf(P({metric:'pe'})),'metric');bad(()=>metricOf(P({}),null),'metric');
  expect(durationOf(P({}),'roe')).toBe('TTM');expect(durationOf(P({duration:'3M'}),'revenue_sum')).toBe('3M');bad(()=>durationOf(P({duration:'3M'}),'gross_margin'),'duration');
  expect(metricsOf(P({metrics:'roe,gross_margin'}))).toEqual(['roe','gross_margin']);expect(metricsOf(P({}))).toHaveLength(7);bad(()=>metricsOf(P({metrics:'roe,roe'})),'metrics');
 });
 it('code, window, on, uuid',()=>{
  expect(codeOf('801120.SI')).toBe('801120.SI');expect(codeOf('3674')).toBe('3674');bad(()=>codeOf('80%2F1'),'code');bad(()=>codeOf('%E0%A4%A'),'code');
  expect(windowOf(P({}))).toBe('10y');bad(()=>windowOf(P({window:'3y'})),'window');
  expect(onOf(P({}),'2026-11-05')).toBe('2026-11-05');bad(()=>onOf(P({on:'2026-11-06'}),'2026-11-05'),'on');bad(()=>onOf(P({on:'2026-02-30'}),'2026-11-05'),'on');
  expect(uuidOf(P({runId:'11111111-1111-4111-8111-11111111111A'}),'runId')).toBe('11111111-1111-4111-8111-11111111111a');bad(()=>uuidOf(P({}),'runId'),'runId');
 });
});

describe('replay rate limiter',()=>{
 it('allows `limit` per window per key, then refuses until the window passes',()=>{
  const l=createRateLimiter(10,60_000);
  for(let i=0;i<10;i++)expect(l.take('1.2.3.4',1_000)).toBe(true);
  expect(l.take('1.2.3.4',1_000)).toBe(false);
  expect(l.take('5.6.7.8',1_000)).toBe(true);
  expect(l.take('1.2.3.4',61_000)).toBe(true);
 });
 it('evicts when full instead of growing without bound',()=>{
  const l=createRateLimiter(1,60_000,2);
  expect(l.take('a',0)).toBe(true);expect(l.take('b',0)).toBe(true);expect(l.take('c',0)).toBe(true);
  expect(l.take('a',0)).toBe(true);   // 'a' was the oldest and got evicted for 'c'
 });
 it('client IP from the first X-Forwarded-For hop',()=>{
  expect(clientIp(new Request('https://x/',{headers:{'x-forwarded-for':'9.9.9.9, 10.0.0.1'}}))).toBe('9.9.9.9');
  expect(clientIp(new Request('https://x/',{headers:{'x-real-ip':'8.8.8.8'}}))).toBe('8.8.8.8');
  expect(clientIp(new Request('https://x/'))).toBe('unknown');
 });
});
