// src/lib/macro/strategy/contract.types.test.ts
// WP-S6 step 1: the strategy contract no longer mirrors P1+P2, it imports them. Identical types are asserted equal both
// ways; narrowed projections are asserted as "real is assignable to the projection" and "the projection is exactly the
// declared Pick / Omit of the real type", so any P1 change to a field strategy code reads breaks typecheck here.
import {describe,expect,expectTypeOf,it} from 'vitest';
import type * as P1 from '../types';
import type * as P2 from '../events';
import {REGIMES as P1_REGIMES} from '../judgment-contract';
import type {Regime as P1Regime} from '../judgment-contract';
import {REGIMES} from './contract';
import type {Bilingual,ChangeKind,DeriveRule,EventInput,MacroSeriesDef,ObservationRow,PolicyEvent,Regime,Region,SeriesType,SnapshotRecord,Timeliness} from './contract';

describe('strategy contract vs real P1+P2 types',()=>{
 it('identical types are equal both ways',()=>{
  expectTypeOf<Region>().toEqualTypeOf<P1.Region>();
  expectTypeOf<SeriesType>().toEqualTypeOf<P1.SeriesType>();
  expectTypeOf<ChangeKind>().toEqualTypeOf<P1.ChangeKind>();
  expectTypeOf<Bilingual>().toEqualTypeOf<P1.Bilingual>();
  expectTypeOf<DeriveRule>().toEqualTypeOf<P1.DeriveRule>();
  expectTypeOf<Timeliness>().toEqualTypeOf<P1.Timeliness>();
  expectTypeOf<Regime>().toEqualTypeOf<P1Regime>();
  expectTypeOf<EventInput>().toEqualTypeOf<P2.EventInput>();
  expectTypeOf<PolicyEvent>().toEqualTypeOf<P2.PolicyEvent>();
 });
 it('projections: real is assignable, and the projection is the declared Pick/Omit',()=>{
  expectTypeOf<P1.ObservationRow>().toExtend<ObservationRow>();
  expectTypeOf<ObservationRow>().toEqualTypeOf<Omit<P1.ObservationRow,'locator'|'code_version'|'batch_id'>>();
  expectTypeOf<P1.SnapshotRecord>().toExtend<SnapshotRecord>();
  expectTypeOf<SnapshotRecord>().toEqualTypeOf<Omit<P1.SnapshotRecord,'failure_reason'>>();
  expectTypeOf<P1.MacroSeriesDef>().toExtend<MacroSeriesDef>();
  expectTypeOf<MacroSeriesDef['source']>().toEqualTypeOf<Pick<P1.SeriesSource,'publisher'|'via'|'fetchHost'|'rights'>|null>();
  expectTypeOf<Omit<MacroSeriesDef,'source'>>().toEqualTypeOf<Omit<P1.MacroSeriesDef,'source'>>();
 });
 it('REGIMES is the real tuple',()=>{expect([...REGIMES]).toEqual([...P1_REGIMES]);});
});
