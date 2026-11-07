// src/lib/macro/read-api.types.test.ts
// Type-level proof that the implementation satisfies the F4 MacroReadApi contract mirror. When F4
// lands, swap the import to src/lib/judgments and keep this file (spec §5.4).
import {describe,expectTypeOf,it} from 'vitest';
import type {MacroObservationRef,MacroReadApi,MacroSnapshotRow,RegimeResult} from './judgment-contract';
import {memoryMacroDb} from './memory-db';
import {macroReadApi} from './read-api';

describe('macroReadApi type contract',()=>{
 it('is assignable to MacroReadApi with the exact method result types',()=>{
  const api=macroReadApi(memoryMacroDb());
  const asContract:MacroReadApi=api;void asContract;
  expectTypeOf(api.observation).returns.resolves.toEqualTypeOf<MacroObservationRef|null>();
  expectTypeOf(api.snapshot).returns.resolves.toEqualTypeOf<MacroSnapshotRow|null>();
  expectTypeOf(api.snapshotsSince).returns.resolves.toEqualTypeOf<MacroSnapshotRow[]>();
  expectTypeOf(api.seriesCatalog).returns.resolves.toEqualTypeOf<Record<string,unknown>[]>();
  expectTypeOf(api.classifyAsOf).returns.resolves.toEqualTypeOf<{regime:RegimeResult|null;observation_refs:MacroObservationRef[];catalog:{version:string;weights:Record<string,number>;rules_version:string}}>();
 });
});
