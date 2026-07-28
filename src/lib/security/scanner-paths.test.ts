import { describe, expect, it } from 'vitest';
import { isScannerPath } from './scanner-paths';

describe('isScannerPath', () => {
  it.each(['/wp-admin', '/wp-admin/install.php', '/wp-login.php', '/xmlrpc.php', '/.env', '/.git/config'])(
    'blocks %s',
    (path) => {
      expect(isScannerPath(path)).toBe(true);
    }
  );

  it.each(['/watchlist', '/api/events', '/settings', '/stock/.gitlab'])(
    'allows %s',
    (path) => {
      expect(isScannerPath(path)).toBe(false);
    }
  );
});
