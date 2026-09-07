import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync(new URL('../../../scripts/vercel-build.ts', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')) as {
  buildCommand?: string;
};

describe('Vercel production schema gate', () => {
  it('gates only production builds before invoking the normal build', () => {
    expect(config.buildCommand).toBe('node --import tsx scripts/vercel-build.ts');
    expect(script).toContain("process.env.VERCEL_ENV === 'production'");
    expect(script.indexOf('assertLatestWatchlistReleaseMarker()')).toBeLessThan(script.indexOf("['run', 'build']"));
  });
});
