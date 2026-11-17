export const NAV_ITEMS = [
  { id: 'macro', navKey: 'macro', href: '/macro', match: ['/macro'] },
  { id: 'watchlist', navKey: 'watchlist', href: '/watchlist', match: ['/watchlist'] },
  { id: 'intel', navKey: 'intel', href: '/intel', match: ['/intel', '/stock'] },
  { id: 'portfolio', navKey: 'portfolio', href: '/portfolio', match: ['/portfolio'] },
  { id: 'analyst', navKey: 'analyst', href: '/analyst', match: ['/analyst'] },
  { id: 'tools', navKey: 'tools', href: '/tools', match: ['/tools'] },
  { id: 'settings', navKey: 'settings', href: '/settings', match: ['/settings'] },
] as const;
export type NavId = typeof NAV_ITEMS[number]['id'];
export const PHONE_TAB_IDS = ['macro', 'watchlist', 'intel', 'portfolio'] as const;
export const MORE_IDS: readonly NavId[] = ['analyst', 'tools', 'settings'];
export function activeNavId(pathname: string): NavId | null {
  return NAV_ITEMS.find(item => item.match.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)))?.id ?? null;
}
export function isMoreActive(pathname: string): boolean {
  const id = activeNavId(pathname);
  return id !== null && MORE_IDS.includes(id);
}
