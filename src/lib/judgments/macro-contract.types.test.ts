// F4 §12.1: both modules must expose mutually assignable contracts.
import {expectTypeOf,it} from 'vitest';
import type * as F4 from './types';
import type * as Macro from '../macro/judgment-contract';
import {macroReadApi} from '../macro/read-api';
import type {MacroDb} from '../macro/db';
it('macro contracts are assignable in both directions',()=>{
 const implemented=macroReadApi({} as MacroDb) satisfies F4.MacroReadApi;
 expectTypeOf<typeof implemented>().toExtend<F4.MacroReadApi>();
 expectTypeOf<F4.MacroReadApi>().toExtend<typeof implemented>();
 expectTypeOf<F4.MacroReadApi>().toExtend<Macro.MacroReadApi>();
 expectTypeOf<Macro.MacroReadApi>().toExtend<F4.MacroReadApi>();
 expectTypeOf<F4.RegimeResult>().toExtend<Macro.RegimeResult>();
 expectTypeOf<Macro.RegimeResult>().toExtend<F4.RegimeResult>();
 expectTypeOf<F4.MacroSnapshotRow>().toExtend<Macro.MacroSnapshotRow>();
 expectTypeOf<Macro.MacroSnapshotRow>().toExtend<F4.MacroSnapshotRow>();
 expectTypeOf<F4.MacroObservationRef>().toExtend<Macro.MacroObservationRef>();
 expectTypeOf<Macro.MacroObservationRef>().toExtend<F4.MacroObservationRef>();
});
