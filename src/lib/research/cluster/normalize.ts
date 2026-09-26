/** WP-A5 canonical forms used for exact-match clustering. Pure. */
const TRACKING = /^(utm_[a-z_]*|fbclid|gclid|dclid|msclkid|spm|from|share_[a-z_]*|ref|refer|source|igshid|mc_[a-z]+)$/i;
const SITE_SUFFIX = /^(新浪财经|新浪网|东方财富网?|东财|同花顺(金融服务网)?|腾讯网|腾讯财经|搜狐证券|搜狐|网易财经|网易|证券之星|和讯网?|金融界|巨潮资讯网?|界面新闻|财联社|华尔街见闻|yahoo finance|investing\.com|marketscreener|bloomberg|reuters|cnbc|seeking alpha|sec\.gov|hkexnews)$/i;

export function normalizeUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
  const path = u.pathname.replace(/\/+$/, '');
  return `https://${host}${u.port && u.port !== '443' && u.port !== '80' ? ':' + u.port : ''}${path}${query}`;
}

export function normalizeTitle(title: string | null | undefined): string | null {
  if (typeof title !== 'string') return null;
  let t = title.normalize('NFKC').toLowerCase().trim();
  if (!t) return null;
  // Drop a short trailing site name after the last separator.
  const parts = t.split(/\s*[|_–—-]\s*/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    if (last.length <= 16 && SITE_SUFFIX.test(last)) t = parts.slice(0, -1).join(' ');
  }
  t = t.replace(/[\s\p{P}\p{S}]+/gu, '');
  return t || null;
}
