// Writes the synthetic HK pages.json fixtures (plan F3 Task 14) from the deterministic builder;
// rerun after changing build.ts and commit the JSON (generate.test.ts fails on drift).
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SYNTHETIC_NAMES,syntheticPagesJson} from '../../src/lib/documents/fixtures/hkex/_synthetic/build';

const dir='src/lib/documents/fixtures/hkex/_synthetic';
for(const name of SYNTHETIC_NAMES){
 const path=join(dir,`${name}.json`);
 writeFileSync(path,JSON.stringify(syntheticPagesJson(name),null,1)+'\n');
 console.log(path);
}
