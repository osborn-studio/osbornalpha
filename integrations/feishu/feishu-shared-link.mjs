// Formal-site links from the bot open as the Feishu simulation account: each one goes through the
// shared login link (FEISHU_SHARED_LOGIN_URL = https://osbornalpha.com/auth/go/<token>), which signs
// the browser into that account and then lands on the original page. With
// FEISHU_OPEN_LINKS_IN_FEISHU=true the link is wrapped in Feishu's web_url AppLink so desktop Feishu
// (7.5+) opens it in its own window, leaving the reader's system-browser login untouched.
const siteOrigin = /^https:\/\/(?:www\.)?osbornalpha\.com$/u;
const loginPath = /^\/auth\/go\/[A-Za-z0-9_-]{40,256}$/u;
// A site URL in message text, up to the first character that cannot belong to a page path or query.
const siteUrl = /https:\/\/(?:www\.)?osbornalpha\.com(\/[A-Za-z0-9/_~.%-]*)?(\?[A-Za-z0-9=&._~%-]*)?(#[A-Za-z0-9_-]*)?(?![A-Za-z0-9/?#=&._~%-])/gu;
const notAPage = /^\/(?:auth|api)(?:\/|$)/u;

export function createSiteLinks(env = process.env) {
  let login = null;
  try {
    const url = new URL(String(env.FEISHU_SHARED_LOGIN_URL ?? ''));
    if (siteOrigin.test(url.origin) && loginPath.test(url.pathname) && !url.search && !url.hash) login = url.origin + url.pathname;
  } catch { /* unset or malformed: links stay as they are */ }
  const inFeishu = env.FEISHU_OPEN_LINKS_IN_FEISHU === 'true';

  /** The shared-login link to a site page such as '/analyst' or '/portfolio?s=00300.HK', or null when off. */
  function link(path = '/') {
    if (!login) return null;
    const go = `${login}?next=${encodeURIComponent(path || '/')}`;
    // The AppLink takes the whole target URL encoded once more (its query is already percent-encoded).
    return inFeishu ? 'https://applink.feishu.cn/client/web_url/open?mode=window&url=' + encodeURIComponent(go) : go;
  }

  /** Replace every formal-site page URL in a message with its shared-login link. */
  function rewrite(text) {
    if (!login || typeof text !== 'string') return text;
    return text.replace(siteUrl, (whole, path = '/', query = '') => notAPage.test(path) ? whole : link(path + query));
  }

  return {active: login !== null, link, rewrite};
}

/** A message sender that rewrites site links first; keeps the wrapped sender's flags (e.g. formalReportWebhook). */
export function withSiteLinks(sender, links) {
  if (!links.active) return sender;
  return Object.assign(message => sender({...message, text: links.rewrite(message.text)}), sender);
}
