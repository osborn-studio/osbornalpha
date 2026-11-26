import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeishuSecurityLookup } from './feishu-security-lookup.mjs';

const listing = (t,n,m,extra = {}) => ({
  t,n,m,match_kind:'exact_alias',verification_status:'verified',list_status:'listed',selectable:true,
  ...extra,
});
const response = results => Response.json({source:'security-master',results});

test('the security master receives only the extracted company name and returns both listings', async () => {
  const fetches = [];
  const lookup = createFeishuSecurityLookup({fetchImpl:async (url,options) => {
    fetches.push({url:new URL(url),options});
    return response([
      listing('02631.HK','天岳先进','HK'),
      listing('688234.SH','天岳先进','A'),
      listing('688234.SH','天岳先进','A'),
      listing('000002.SZ','其他公司','A',{match_kind:'fuzzy'}),
      listing('600991.SH','历史同名证券','A',{verification_status:'pending'}),
      listing('688235.SH','天岳先进','HK'),
      listing('688236.SH','天岳先进','A',{list_status:'paused'}),
      listing('688237.SH','天岳先进','A',{selectable:false}),
    ]);
  }});
  const matches = [
    {ticker:'02631.HK',market:'HK',name:'天岳先进'},
    {ticker:'688234.SH',market:'A',name:'天岳先进'},
  ];
  assert.deepEqual(await lookup('　天岳先进　'),matches);
  assert.deepEqual(await lookup('天岳先进',{market:'HK'}),[matches[0]]);
  assert.equal(fetches[0].url.origin,'https://osbornalpha.com');
  assert.equal(fetches[0].url.pathname,'/api/search');
  assert.deepEqual([...fetches[0].url.searchParams],[['q','天岳先进'],['limit','30']]);
  assert.equal(fetches[0].options.redirect,'error');
  assert.ok(fetches[0].options.signal instanceof AbortSignal);
});

test('standard HK name markers resolve the listing while issuer names and RMB counters stay distinct', async () => {
  const rows = [
    listing('01810.HK','小米集团-W','HK',{match_kind:'name'}),
    listing('81810.HK','小米集团-WR','HK',{match_kind:'name'}),
    listing('01698.HK','腾讯音乐-SW','HK',{match_kind:'name'}),
    listing('00700.HK','腾讯控股','HK',{match_kind:'fuzzy'}),
    listing('02015.HK','理想汽车-W','HK',{match_kind:'name'}),
  ];
  const lookup = createFeishuSecurityLookup({fetchImpl:async () => response(rows)});
  assert.deepEqual((await lookup('小米集团')).map(item => item.ticker),['01810.HK']);
  assert.deepEqual((await lookup('小米集团－Ｗ')).map(item => item.ticker),['01810.HK']);
  assert.deepEqual((await lookup('小米集团-WR')).map(item => item.ticker),['81810.HK']);
  assert.deepEqual((await lookup('腾讯音乐')).map(item => item.ticker),['01698.HK']);
  assert.deepEqual((await lookup('理想汽车')).map(item => item.ticker),['02015.HK']);
  assert.deepEqual(await lookup('腾讯'),[]);
});

test('invalid input and non-authoritative search responses never return listings', async () => {
  let calls = 0;
  const lookup = createFeishuSecurityLookup({fetchImpl:async () => {
    calls++;
    return Response.json({source:'developer-fallback',results:[listing('NVDA','英伟达','US')]});
  }});
  assert.deepEqual(await lookup(''),[]);
  assert.deepEqual(await lookup('英伟达\n苹果'),[]);
  assert.deepEqual(await lookup('字'.repeat(81)),[]);
  assert.deepEqual(await lookup('英伟达',{market:'CN'}),[]);
  assert.equal(calls,0);
  await assert.rejects(lookup('英伟达'),{message:'证券主表暂时不可用。'});
  assert.equal(calls,1);
  const delayed = createFeishuSecurityLookup({timeoutMs:2,fetchImpl:async () => {
    await new Promise(resolve => setTimeout(resolve,15));
    return response([listing('NVDA','英伟达','US')]);
  }});
  await assert.rejects(delayed('英伟达'),{message:'证券主表暂时不可用。'});
});

test('a short issuer name can return verified clarification choices without making any an exact match', async () => {
  const rows = [
    listing('000333.SZ','美的集团','A',{match_kind:'name'}),
    listing('00300.HK','美的集团','HK',{match_kind:'name'}),
    listing('03990.HK','美的置业','HK',{match_kind:'name'}),
    listing('000001.SZ','美的关联公司','A',{match_kind:'fuzzy'}),
    listing('000002.SZ','另一家美的公司','A',{match_kind:'name'}),
    listing('000003.SZ','美的子公司','A',{match_kind:'name',selectable:false}),
  ];
  const lookup = createFeishuSecurityLookup({fetchImpl:async () => response(rows)});
  const expected = [
    {ticker:'000333.SZ',market:'A',name:'美的集团',suggestionOnly:true},
    {ticker:'00300.HK',market:'HK',name:'美的集团',suggestionOnly:true},
    {ticker:'03990.HK',market:'HK',name:'美的置业',suggestionOnly:true},
  ];
  assert.deepEqual(await lookup('美的'),[]);
  assert.deepEqual(await lookup('美的',{includeSuggestions:true}),expected);
  assert.deepEqual(await lookup('美的',{includeSuggestions:true,market:'A'}),[expected[0]]);
  assert.deepEqual(await lookup('美',{includeSuggestions:true}),[]);
  const exact = {ticker:'000333.SZ',market:'A',name:'美的集团'};
  rows.push(listing('000333.SZ','美的集团','A',{match_kind:'exact_alias'}));
  assert.deepEqual(await lookup('美的',{includeSuggestions:true}),[exact,...expected.slice(1)]);
  assert.deepEqual(await lookup('美的'),[exact]);
});
