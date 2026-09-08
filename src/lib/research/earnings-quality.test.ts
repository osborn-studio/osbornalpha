import { expect,it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewEarningsQuality } from './earnings-quality';
import fixtures from './earnings-quality-vendor/quality-fixtures.json';
import manifest from './earnings-quality-vendor/manifest.json';
it('uses byte-identical Catalog candidate files',()=>{
 for(const f of manifest.files)expect(createHash('sha256').update(readFileSync(join(process.cwd(),'src/lib/research/earnings-quality-vendor',f.name))).digest('hex')).toBe(f.sha256);
 expect(createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex')).toBe(manifest.sha256);
});
for(const c of fixtures.cases)it(`adopts canonical result ${c.id} without a host service`,()=>{
 const r=reviewEarningsQuality(JSON.stringify(c.input));
 expect(r.output.current.cashConversion.value).toBeCloseTo(c.expected.cashConversion,12);
 expect(r.output.current.netMargin.value).toBeCloseTo(c.expected.currentNetMargin,12);
 expect(r.retention).toBe('not-saved');expect(r.releaseDigest).toBe(manifest.sha256);
});
