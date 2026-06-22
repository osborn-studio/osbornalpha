import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Server-component pages under the auth-gated (app) layout MUST be explicitly
// dynamic. Without this, Vercel build-cache / static optimization can prerender
// them; then the layout's cookies()/getUser() throws DynamicServerError at
// request time → "errors only after login on the one server page". Regression
// guard for that production bug.
const ROOT = join(process.cwd(), 'src/app/(app)');
const SERVER_PAGES = [
  'briefs/page.tsx',
  'briefs/[date]/page.tsx',
  'copilot/page.tsx',
];

describe('auth-gated server pages are force-dynamic', () => {
  for (const rel of SERVER_PAGES) {
    it(`${rel} declares dynamic = 'force-dynamic'`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      // these pages are server components (no 'use client') and must opt into dynamic
      expect(src.includes("'use client'")).toBe(false);
      expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
    });
  }
});
