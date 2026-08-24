const EXACT = new Set(['/wp-login.php', '/xmlrpc.php', '/.env']);
const PREFIXES = ['/wp-admin', '/.git'];

export function isScannerPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return EXACT.has(normalized)
    || PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}
