import {inferCoreMarket, normalizeSecurityTicker} from '../../src/lib/securities/ticker.ts';

const officialSite = 'https://osbornalpha.com';

function publicSite(configured) {
  if (!configured) return officialSite;
  try {
    const parsed = new URL(configured);
    if (parsed.href === parsed.origin + '/' && [officialSite,'https://www.osbornalpha.com'].includes(parsed.origin)) return parsed.origin;
  } catch { /* An invalid integration endpoint must never become a public link. */ }
  return null;
}

function baseShareLink(raw) {
  if (!raw || raw.length > 2048 || /[\s\\]/u.test(raw)) return null;
  let link;
  try { link = new URL(raw); } catch { return null; }
  if (link.protocol !== 'https:' || link.username || link.password || link.port ||
      !/^(?:[a-z0-9-]+\.)?feishu\.cn$/u.test(link.hostname) ||
      !/^\/(?:base|wiki|share\/base\/(?:dashboard|view))\/[a-zA-Z0-9_-]+\/?$/u.test(link.pathname)) return null;
  // Copy only parameters that select a specific table or view; discard tracking,
  // redirects, authentication data and fragments supplied by the browser.
  const publicLink = new URL(link.pathname,link.origin);
  for (const key of ['table','view','dashboard','record']) {
    const value = link.searchParams.get(key);
    if (value && /^[A-Za-z0-9_-]{1,120}$/u.test(value)) publicLink.searchParams.set(key,value);
  }
  return publicLink.href;
}

function canonicalTicker(raw) {
  if (typeof raw !== 'string' || !/^[A-Z0-9][A-Z0-9.-]{0,15}$/iu.test(raw)) return null;
  const market = inferCoreMarket(raw);
  return market && normalizeSecurityTicker(raw,market);
}

export function createFeishuNavigation(env = process.env) {
  const site = publicSite(env.FEISHU_SIMULATION_ORIGIN);
  const appId = /^cli_[0-9a-f]{16}$/iu.test(env.FEISHU_APP_ID ?? '') ? env.FEISHU_APP_ID : null;
  const bot = appId && 'https://applink.feishu.cn/client/bot/open?appId=' + appId;
  const webApp = appId && env.FEISHU_NAVIGATION_WEB_APP_ENABLED === 'true' &&
    'https://applink.feishu.cn/client/web_app/open?appId=' + appId;
  const base = baseShareLink(env.FEISHU_NAVIGATION_BASE_URL);

  function url(target,ticker) {
    if (target === 'context') target = canonicalTicker(ticker) ? 'portfolio' : 'home';
    if (target === 'bot') return bot;
    if (target === 'web_app') return webApp || null;
    if (target === 'base') return base;
    if (!site) return null;
    if (target === 'home') return site + '/';
    if (target === 'analyst') return site + '/analyst';
    if (target !== 'portfolio') return null;
    const link = new URL('/portfolio',site);
    const listing = canonicalTicker(ticker);
    if (listing) link.searchParams.set('s',listing);
    return link.href;
  }

  function render(target,ticker) {
    if (target === 'directory') {
      return [render('home'),render('bot'),webApp ? '打开飞书网页应用 ' + webApp : '尚未配置飞书网页应用入口。',render('base')].join('\n');
    }
    if (target === 'context') target = canonicalTicker(ticker) ? 'portfolio' : 'home';
    const link = url(target,ticker);
    if (target === 'base') return link ? '群多维表格或仪表盘 ' + link : '本群还没有配置多维表格或仪表盘的分享链接。';
    if (target === 'bot') return link ? '打开 osborn分析助手单聊 ' + link : '可以在飞书内搜索「osborn分析助手」进入单聊。';
    if (target === 'web_app') return link ? '打开飞书网页应用 ' + link : '连接器尚未配置飞书网页应用入口。\n' + render('home');
    const listing = canonicalTicker(ticker);
    const label = {home:'Osborn Alpha 正式站',analyst:'分析建议',portfolio:listing ? '我的投资 · ' + listing : '我的投资'}[target];
    return label && link ? label + ' ' + link : '当前没有可用的正式页面入口。';
  }
  return {url,render};
}
