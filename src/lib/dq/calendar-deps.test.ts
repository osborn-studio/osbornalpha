// src/lib/dq/calendar-deps.test.ts
import {describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({tushare:vi.fn(),submissions:vi.fn()}));
vi.mock('../data/sources/tushare',async(orig)=>({...(await orig<typeof import('../data/sources/tushare')>()),tushareCallRaw:mocks.tushare}));
vi.mock('../entities/identifiers/sec-submissions',async(orig)=>({...(await orig<typeof import('../entities/identifiers/sec-submissions')>()),fetchSubmissions:mocks.submissions}));
vi.mock('../supabase/admin',()=>({getAdminSupabase:()=>{throw new Error('no admin in unit tests');}}));

import {productionCalendarDeps} from './calendar-deps';
import {memoryRawStore} from './raw-store';
import {DISCLOSURE_FIELDS} from './calendar-sync';

const fakeAdmin={rpc:vi.fn(),from:vi.fn(),storage:{from:vi.fn()}} as never;

describe('productionCalendarDeps',()=>{
 it('wires disclosure_date through tushareCallRaw with the budget, and submissions through fetchSubmissions + submissionsView',async()=>{
  const deps=productionCalendarDeps({deadline:new Date(Date.now()+240_000),codeVersion:'c',admin:fakeAdmin});
  mocks.tushare.mockResolvedValue({code:0});
  await deps.disclosureDate('600519.SH',deps.budget);
  expect(mocks.tushare).toHaveBeenCalledWith('disclosure_date',{ts_code:'600519.SH'},DISCLOSURE_FIELDS,{budget:deps.budget});
  mocks.submissions.mockResolvedValue({cik:'320193',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'s',path:'sec-submissions/s.json'},pages:[],complete:true,
   parsed:{cik:'320193',name:'Apple Inc.',category:'Large accelerated filer',fiscalYearEnd:'0927',tickers:[],exchanges:[],formerNames:[],filings:[],files:[]}});
  expect(await deps.submissions('0000320193',deps.budget)).toEqual({cik10:'0000320193',sha256:'s',category:'Large accelerated filer',fiscalYearEnd:'0927',entries:[],pages:[{name:'recent',sha256:'s'}]});
  expect(mocks.submissions.mock.calls[0][0]).toBe('0000320193');
  expect(mocks.submissions.mock.calls[0][1]).toMatchObject({raw:expect.anything(),budget:deps.budget});
  expect(mocks.submissions.mock.calls[0][2]).toEqual({coverFrom:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)});
  expect(deps.budget.remainingMs()).toBeGreaterThan(200_000);
  expect(deps.codeVersion).toBe('c');
 });
 it('an injected raw store is the one the returned deps AND the submissions fetcher use (preview must never upload to the Supabase store)',async()=>{
  const uploads:string[]=[];
  const admin={rpc:vi.fn(),from:vi.fn(),storage:{from:(b:string)=>{uploads.push(b);throw new Error('production storage touched');}}} as never;
  const raw=memoryRawStore();
  const deps=productionCalendarDeps({deadline:null,codeVersion:'c',admin,raw});
  expect(deps.raw).toBe(raw);
  mocks.submissions.mockClear();
  mocks.submissions.mockResolvedValue({cik:'320193',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'s',path:'p'},pages:[],complete:true,
   parsed:{cik:'320193',name:null,category:null,fiscalYearEnd:null,tickers:[],exchanges:[],formerNames:[],filings:[],files:[]}});
  await deps.submissions('0000320193',deps.budget);
  expect(mocks.submissions.mock.calls[0][1].raw).toBe(raw);
  expect(uploads).toEqual([]);
 });
});
