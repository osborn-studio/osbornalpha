// scripts/macro/export-cn-series.ts
// Writes scripts/macro/cn-series.json (the Python collector's series list) from src/lib/macro/cn-series.ts,
// i.e. from the catalog. Re-run after any CN catalog change; src/lib/macro/cn-series.test.ts fails while the
// committed file is stale. Run: npx tsx scripts/macro/export-cn-series.ts
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {cnSeriesDocument} from '../../src/lib/macro/cn-series';

writeFileSync(join(process.cwd(),'scripts/macro/cn-series.json'),cnSeriesDocument());
console.log('wrote scripts/macro/cn-series.json');
