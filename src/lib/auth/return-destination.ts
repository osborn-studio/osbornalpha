// Login returns carry navigation state, never arbitrary queries (tokens, codes,
// nested next URLs, etc.). Keep this edge/browser-safe and independent of DB code.
const INDUSTRY_SELECTORS: Record<string, RegExp> = {
  scheme: /^(sic|sw2021)$/,
  metric: /^(revenue_sum|net_income_parent_sum|gross_margin|roe|revenue_yoy|net_income_yoy|member_count)$/,
  level: /^[1-3]$/,
  duration: /^(12M|3M|TTM|INSTANT)$/,
  view: /^(heatmap|table)$/,
  periods: /^([1-9]|[1-3][0-9]|4[0-4])$/,
};

export function loginReturnDestination(value: string | null): string {
  // Only literal application paths. Reject absolute/protocol-relative URLs,
  // backslashes, control characters, and encoded/double-encoded path tricks.
  if (!value || !/^\/(?!\/)[a-zA-Z0-9/_~.-]*(?:[?#]|$)/.test(value)) return '/macro';
  const url = new URL(value, 'https://login-return.invalid');
  const pathname = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  if (pathname.startsWith('//') || /^\/(login|register|forgot-password|reset-password|auth|api)(\/|$)/.test(pathname)) return '/macro';
  const search = new URLSearchParams();
  if (pathname === '/intel/industries') {
    for (const [key, allowed] of Object.entries(INDUSTRY_SELECTORS)) {
      const values = url.searchParams.getAll(key);
      if (values.length === 1 && allowed.test(values[0])) search.set(key, values[0]);
    }
  }
  const query = search.toString();
  return pathname + (query ? `?${query}` : '');
}
