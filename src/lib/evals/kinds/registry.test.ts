// src/lib/evals/kinds/registry.test.ts
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import type {EvalKind} from '../types';
import {KIND_REGISTRY,assertKindEnabled,kindEntry} from './registry';

const runCli=(kind:string)=>spawnSync(process.execPath,['--import','tsx',resolve('scripts/evals/run.ts'),'--kind',kind,'--module','facts','--mode','ci'],{encoding:'utf8',timeout:120000});

describe('KIND_REGISTRY',()=>{
 it('dual_source and reference_regression are registered but not enabled, with their prerequisite',()=>{
  expect(kindEntry('dual_source')).toEqual({kind:'dual_source',enabled:false,reason:'prerequisite: plan 3 merged'});
  expect(kindEntry('reference_regression')).toEqual({kind:'reference_regression',enabled:false,reason:'prerequisite: macro migrations'});
  expect(kindEntry('official_reconciliation')?.enabled).toBe(true);
  expect(kindEntry('replay_consistency')?.enabled).toBe(true);
  expect(new Set(KIND_REGISTRY.map(e=>e.kind)).size).toBe(KIND_REGISTRY.length);
 });
 it('the CLI dispatch table has a runner for exactly the enabled kinds (one enablement table)',async()=>{
  const {KIND_RUNNERS}=await import('../cli/run-cli');
  expect(Object.keys(KIND_RUNNERS).sort()).toEqual(KIND_REGISTRY.filter(e=>e.enabled).map(e=>e.kind).sort());
 });
 it('assertKindEnabled: kind_not_enabled (a refusal, exit 2) for disabled or unregistered kinds',()=>{
  for(const k of ['dual_source','reference_regression','no_such_kind']){
   try{assertKindEnabled(k);throw new Error('not thrown');}
   catch(e){expect(e).toBeInstanceOf(EvalError);expect((e as EvalError).code).toBe('kind_not_enabled');}
  }
  expect(()=>assertKindEnabled('official_reconciliation')).not.toThrow();
 });
 it('scripts/evals/run.ts refuses dual_source and reference_regression with exit 2 before any work',()=>{
  for(const k of ['dual_source','reference_regression']){
   const r=runCli(k);
   expect(r.status).toBe(2);
   expect(`${r.stderr}${r.stdout}`).toContain('kind_not_enabled');
   expect(r.stderr).toContain('prerequisite: ');
  }
 },240000);
 it('Task 15: extraction_gold and judgment_calibration are registered, disabled, with their reasons; every EvalKind has exactly one entry',()=>{
  expect(kindEntry('extraction_gold')).toEqual({kind:'extraction_gold',enabled:false,reason:'D8: license decision pending'});
  expect(kindEntry('judgment_calibration')).toEqual({kind:'judgment_calibration',enabled:false,reason:'prerequisite: F4 settledForecasts and thresholds'});
  for(const kind of ['extraction_gold','judgment_calibration'])expect(()=>assertKindEnabled(kind)).toThrowError(/not enabled/);
  const all:EvalKind[]=['official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration'];
  expect(KIND_REGISTRY.map(e=>e.kind).sort()).toEqual([...all].sort());
 });
 it('Task 15: scripts/evals/run.ts refuses extraction_gold and judgment_calibration with exit 2',()=>{
  for(const k of ['extraction_gold','judgment_calibration']){
   const r=runCli(k);
   expect(r.status).toBe(2);
   expect(`${r.stderr}${r.stdout}`).toContain('kind_not_enabled');
  }
 },240000);
});
