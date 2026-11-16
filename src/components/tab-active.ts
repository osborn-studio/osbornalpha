export function isTabActive(pathname: string, href: string): boolean {
  const path = href.split('?')[0];
  return pathname === path || pathname.startsWith(path + '/');
}
