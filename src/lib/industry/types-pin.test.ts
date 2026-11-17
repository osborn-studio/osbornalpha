import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

// macro_regime@v2 hashes this import closure, including the exact bytes of types.ts.
// Keep US extensions in types-us.ts so registered formula hashes remain stable.
it.each(['net_margin','ambiguous_period','membership_on'])('keeps %s out of the pinned industry contract',token=>{
 expect(readFileSync('src/lib/industry/types.ts','utf8')).not.toContain(token);
});
