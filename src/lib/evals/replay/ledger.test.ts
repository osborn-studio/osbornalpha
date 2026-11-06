// src/lib/evals/replay/ledger.test.ts
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {isSelfApproved,matchLedger,parseLedger} from './ledger';
import type {LedgerEntry,ObservedDiff} from './ledger';

const H0='a'.repeat(64),H1='b'.repeat(64),S='5'.repeat(64),C1='1'.repeat(40),C2='2'.repeat(40);
const F=['facts[revenue/2023-10-01..2024-09-28/12M/USD/2025-01-15/0009990601-25-000002].value_text'];
const raw=(p:Record<string,unknown>={})=>({ledger_id:'L1',case_id:'c1',mode:'frozen',changed_fields:F,before_hash:H0,after_hash:H1,from_code:C1,to_code:C2,from_setup_sha256:S,to_setup_sha256:S,
 reason_code:'bug_fixed',evidence:{pr:12,regression_test:'src/lib/facts/derive.test.ts::ttm'},added_by:'claude-code',added_at:'2026-11-06T00:00:00Z',approved_by:'owner',approval_ref:'https://github.com/osborn-studio/OsbornAlpha/pull/12#pullrequestreview-1',approved_at:'2026-11-06T02:00:00Z',...p});
const liveRaw=(p:Record<string,unknown>={})=>{
 const r:Record<string,unknown>=raw({mode:'live',from_state_rev:12,to_state_rev:15,reason_code:'quarantine_resolved',evidence:{quarantine_id:'q-1'}});
 delete r.from_setup_sha256;delete r.to_setup_sha256;Object.assign(r,p);
 for(const k of Object.keys(r))if(r[k]===undefined)delete r[k];
 return r;
};
const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof EvalError?e.code:`other:${String(e)}`;}};
const diff=(p:Partial<ObservedDiff>={}):ObservedDiff=>({case_id:'c1',mode:'frozen',before_hash:H0,after_hash:H1,from_code:C1,to_code:C2,from_setup_sha256:S,to_setup_sha256:S,changed_fields:F,...p});

describe('parseLedger',()=>{
 it('accepts frozen and live entries; [] is valid',()=>{
  expect(parseLedger([])).toEqual([]);
  expect(parseLedger([raw(),liveRaw({ledger_id:'L2'})]).map(e=>e.ledger_id)).toEqual(['L1','L2']);
 });
 it('structural refusals are gold_invalid',()=>{
  const bad:Record<string,unknown>[]=[raw({approval_ref:''}),raw({approval_ref:undefined}),raw({from_setup_sha256:undefined}),raw({to_setup_sha256:'x'}),raw({from_state_rev:1}),
   liveRaw({to_state_rev:undefined}),liveRaw({from_setup_sha256:S}),raw({before_hash:'abc'}),raw({to_code:'z'.repeat(40)}),raw({reason_code:'because'}),raw({changed_fields:[]}),
   raw({evidence:{pr:12}}),liveRaw({evidence:{}}),raw({added_at:'never'}),raw({mode:'both'})];
  for(const b of bad){for(const k of Object.keys(b))if(b[k]===undefined)delete b[k];expect(code(()=>parseLedger([b]))).toBe('gold_invalid');}
  expect(code(()=>parseLedger([raw(),raw()]))).toBe('gold_invalid');   // duplicate ledger_id
  expect(code(()=>parseLedger({}))).toBe('gold_invalid');
 });
 it('a self-approved entry parses and is flagged',()=>{
  const [e]=parseLedger([raw({approved_by:'claude-code'})]);
  expect(isSelfApproved(e)).toBe(true);
 });
});

describe('matchLedger',()=>{
 const entries=():LedgerEntry[]=>parseLedger([raw()]);
 it('hit on the exact tuple and an equal changed_fields set (order-insensitive)',()=>{
  expect(matchLedger(entries(),diff())).toEqual({kind:'hit',ledger_ids:['L1']});
  const two=parseLedger([raw({changed_fields:[...F,'facts[x].disclosure_seq']})]);
  expect(matchLedger(two,diff({changed_fields:['facts[x].disclosure_seq',...F]}))).toEqual({kind:'hit',ledger_ids:['L1']});
 });
 it('partial when the tuple matches but the fields do not (missing or extra)',()=>{
  expect(matchLedger(entries(),diff({changed_fields:[...F,'facts[x].disclosure_seq']}))).toEqual({kind:'partial',ledger_ids:['L1']});
  const extra=parseLedger([raw({changed_fields:[...F,'facts[x].is_current']})]);
  expect(matchLedger(extra,diff()).kind).toBe('partial');
 });
 it('self_approved when only a self-approved entry matches exactly',()=>{
  expect(matchLedger(parseLedger([raw({approved_by:'claude-code'})]),diff())).toEqual({kind:'self_approved',ledger_ids:['L1']});
 });
 it('none when any tuple member differs (each key), including a changed after_hash',()=>{
  const alt:Partial<ObservedDiff>[]=[{case_id:'c2'},{mode:'live'},{before_hash:H1},{after_hash:'c'.repeat(64)},{from_code:C2},{to_code:C1},{from_setup_sha256:'6'.repeat(64)},{to_setup_sha256:'6'.repeat(64)}];
  for(const a of alt)expect(matchLedger(entries(),diff(a)).kind).toBe('none');
 });
 it('live entries match on from/to_state_rev; a null current rev never matches',()=>{
  const live=parseLedger([liveRaw()]);
  const d=diff({mode:'live',from_setup_sha256:undefined,to_setup_sha256:undefined,from_state_rev:12,to_state_rev:15});
  expect(matchLedger(live,d).kind).toBe('hit');
  expect(matchLedger(live,{...d,to_state_rev:16}).kind).toBe('none');
  expect(matchLedger(live,{...d,to_state_rev:null}).kind).toBe('none');
 });
});
