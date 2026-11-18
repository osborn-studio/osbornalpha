import {expect,it} from 'vitest';
import {companySources} from './company-sources';
it('unknown CN suffix has no relay publisher',()=>expect(companySources('CN','UNKNOWN')).toEqual([{publisher:'CNINFO'}]));
