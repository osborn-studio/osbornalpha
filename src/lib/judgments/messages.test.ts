// src/lib/judgments/messages.test.ts
// messages/{zh,en}/judgments.json: key parity, placeholder parity, and a label for every enum value
// the display layer emits (src/i18n/messages-parity.test.ts only covers its own fixed domain list).
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {CALIBRATION_STATES_BY_KIND,KINDS,PRIVATE_LIFECYCLES,PUBLIC_LIFECYCLES} from './display';
import {PUBLIC_INPUT_KINDS} from './types';

const load=(l:'zh'|'en')=>JSON.parse(readFileSync(join(process.cwd(),'messages',l,'judgments.json'),'utf8')) as Record<string,unknown>;
const leaves=(v:unknown,prefix=''):[string,string][]=>typeof v==='string'?[[prefix,v]]:Object.entries(v as Record<string,unknown>).flatMap(([k,c])=>leaves(c,prefix?`${prefix}.${k}`:k));
const placeholders=(s:string)=>[...s.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]).sort();

describe('judgments messages',()=>{
 const zh=new Map(leaves(load('zh'))),en=new Map(leaves(load('en')));
 it('zh and en have the same keys, all non-empty strings',()=>{
  expect([...zh.keys()].sort()).toEqual([...en.keys()].sort());
  for(const [k,v] of [...zh,...en])expect(v.trim().length,k).toBeGreaterThan(0);
 });
 it('zh and en use the same placeholders per key',()=>{
  for(const [k,v] of zh)expect(placeholders(v),k).toEqual(placeholders(en.get(k)!));
 });
 it('every lifecycle, calibration state, kind, input kind and derived-odds reason has a label',()=>{
  const need=[
   ...[...new Set([...PUBLIC_LIFECYCLES,...PRIVATE_LIFECYCLES])].map(l=>`lifecycle.${l}`),
   ...[...new Set([...Object.values(CALIBRATION_STATES_BY_KIND).flat(),'self_assessed'])].map(c=>`calibration.${c}`),
   ...KINDS.map(k=>`kind.${k}`),
   ...[...PUBLIC_INPUT_KINDS,'legacy_fill','document_span'].map(k=>`inputs.kind.${k}`),
   ...['wrong_type','not_open','not_calibrated','invalid_k','scenarios_missing','scenarios_not_normalized','scenario_values_invalid','inputs_inconsistent','event_mismatch','as_of_mismatch','subject_mismatch','target_mismatch','unit_mismatch','invalid_probability','odds_not_finite'].map(r=>`derived.reasons.${r}`),
  ];
  for(const k of need)expect(zh.has(k),k).toBe(true);
 });
});
