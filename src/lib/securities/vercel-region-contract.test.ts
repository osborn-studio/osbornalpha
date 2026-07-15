import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vercel data locality', () => {
  it('runs functions beside the Tokyo Supabase project', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(config.regions).toEqual(['hnd1']);
  });
});
