import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteLinks, withSiteLinks} from './feishu-shared-link.mjs';

const token = 'k'.repeat(48);
const login = 'https://osbornalpha.com/auth/go/' + token;
const go = path => `${login}?next=${encodeURIComponent(path)}`;

test('off unless the shared login link is a formal-site /auth/go URL', () => {
  for (const value of [undefined, '', 'not a url', 'https://evil.example/auth/go/' + token, 'http://osbornalpha.com/auth/go/' + token,
    'https://osbornalpha.com/auth/go/short', login + '?next=/x', 'https://osbornalpha.com/analyst']) {
    const links = createSiteLinks({FEISHU_SHARED_LOGIN_URL: value});
    assert.equal(links.active, false, String(value));
    assert.equal(links.rewrite('Osborn Alpha 正式站 https://osbornalpha.com/analyst'), 'Osborn Alpha 正式站 https://osbornalpha.com/analyst');
  }
});

test('rewrites every site page link in a reply and leaves everything else alone', () => {
  const links = createSiteLinks({FEISHU_SHARED_LOGIN_URL: login});
  const text = [
    'Osborn Alpha 正式站 https://osbornalpha.com/',
    '分析建议 https://osbornalpha.com/analyst，请查看。',
    '我的投资 · 00300.HK https://www.osbornalpha.com/portfolio?s=00300.HK',
    '看板（https://osbornalpha.com/analyst/report#top）',
    '站点 https://osbornalpha.com',
    '入口 ' + login + '?next=%2Fanalyst',
    '接口 https://osbornalpha.com/api/search?q=x',
    '多维表格 https://example.feishu.cn/base/abc',
    '相似域名 https://osbornalpha.com.evil.example/analyst',
  ].join('\n');
  assert.equal(links.rewrite(text), [
    'Osborn Alpha 正式站 ' + go('/'),
    '分析建议 ' + go('/analyst') + '，请查看。',
    '我的投资 · 00300.HK ' + go('/portfolio?s=00300.HK'),
    '看板（' + go('/analyst/report') + '）',
    '站点 ' + go('/'),
    '入口 ' + login + '?next=%2Fanalyst',
    '接口 https://osbornalpha.com/api/search?q=x',
    '多维表格 https://example.feishu.cn/base/abc',
    '相似域名 https://osbornalpha.com.evil.example/analyst',
  ].join('\n'));
});

test('optionally opens the link in a Feishu window through the web_url AppLink', () => {
  const links = createSiteLinks({FEISHU_SHARED_LOGIN_URL: login, FEISHU_OPEN_LINKS_IN_FEISHU: 'true'});
  const wrapped = links.link('/analyst');
  assert.equal(wrapped, 'https://applink.feishu.cn/client/web_url/open?mode=window&url=' + encodeURIComponent(go('/analyst')));
  assert.equal(new URL(wrapped).searchParams.get('url'), go('/analyst')); // Feishu decodes it back to the login link
});

test('the sender wrapper rewrites text and keeps the sender flags', async () => {
  const sent = [];
  const sender = Object.assign(async message => { sent.push(message); return {messageId: 'om_1'}; }, {formalReportWebhook: true});
  const wrapped = withSiteLinks(sender, createSiteLinks({FEISHU_SHARED_LOGIN_URL: login}));
  assert.equal(wrapped.formalReportWebhook, true);
  assert.deepEqual(await wrapped({chatId: 'oc_1', text: '分析建议 https://osbornalpha.com/analyst', uuid: 'u1'}), {messageId: 'om_1'});
  assert.deepEqual(sent, [{chatId: 'oc_1', text: '分析建议 ' + go('/analyst'), uuid: 'u1'}]);
  assert.equal(withSiteLinks(sender, createSiteLinks({})), sender);
});
