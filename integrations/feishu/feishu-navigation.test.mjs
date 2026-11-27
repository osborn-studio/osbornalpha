import assert from 'node:assert/strict';
import test from 'node:test';
import {createFeishuNavigation} from './feishu-navigation.mjs';

const appId = 'cli_0123456789abcdef';

test('formal navigation uses known public pages and canonical tickers without reflecting URLs',()=>{
  const nav=createFeishuNavigation({});
  assert.equal(nav.url('home'),'https://osbornalpha.com/');
  assert.equal(nav.url('analyst'),'https://osbornalpha.com/analyst');
  assert.equal(nav.url('context','300.hk'),'https://osbornalpha.com/portfolio?s=00300.HK');
  assert.equal(nav.url('portfolio','000333.SZ'),'https://osbornalpha.com/portfolio?s=000333.SZ');
  assert.equal(nav.url('context'),'https://osbornalpha.com/');
  assert.equal(nav.url('portfolio','00300.HK&x=bad'),'https://osbornalpha.com/portfolio');
  assert.equal(nav.url('https://other.example'),null);
  for (const origin of ['http://127.0.0.1:3000','https://osbornalpha.com.example','https://secret@osbornalpha.com','https://osbornalpha.com/api?token=secret']) {
    assert.equal(createFeishuNavigation({FEISHU_SIMULATION_ORIGIN:origin}).url('portfolio','300.HK'),null);
  }
});

test('private bot chat and enabled web application are distinct official AppLinks',()=>{
  const env={FEISHU_APP_ID:appId};
  const nav=createFeishuNavigation(env);
  assert.equal(nav.url('bot'),'https://applink.feishu.cn/client/bot/open?appId='+appId);
  assert.equal(nav.url('web_app'),null);
  assert.match(nav.render('web_app'),/尚未配置[\s\S]+osbornalpha\.com/);
  assert.match(nav.render('directory'),/正式站[\s\S]+单聊[\s\S]+尚未配置[\s\S]+多维表格/);
  assert.equal(createFeishuNavigation({...env,FEISHU_NAVIGATION_WEB_APP_ENABLED:'true'}).url('web_app'),
    'https://applink.feishu.cn/client/web_app/open?appId='+appId);
  assert.equal(createFeishuNavigation({FEISHU_APP_ID:appId+'&redirect=evil'}).url('bot'),null);
});

test('only configured Feishu Base or dashboard resources and table selectors reach the group',()=>{
  const base = link=>createFeishuNavigation({FEISHU_NAVIGATION_BASE_URL:link}).url('base');
  for (const path of ['/base/Example123','/wiki/Example123','/share/base/dashboard/Example-123']) {
    const href='https://test-team.feishu.cn'+path;
    assert.equal(base(href+'?table=tbl123&view=vew678&from=copylink&token=secret#secret'),href+'?table=tbl123&view=vew678');
  }
  for (const link of ['http://test-team.feishu.cn/base/Example123','https://test.feishu.cn.example/base/X',
    'https://test.feishu.cn:8443/base/X','https://test.feishu.cn@other.example/base/X','https://user@test.feishu.cn/base/X',
    'https://open.feishu.cn/open-apis/bot/v2/hook/private','https://test.feishu.cn/base/abc%2F%2Fevil',
    'https://test.feishu.cn/share/sso/redirect','https://test.feishu.cn/base/X\nhttps://other.example']) {
    assert.equal(base(link),null);
  }
  assert.match(createFeishuNavigation({}).render('base'),/还没有配置/);
});
