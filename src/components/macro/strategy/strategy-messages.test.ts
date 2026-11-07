// macroStrategy i18n domain (spec §10): zh/en key and placeholder parity, registration inside the MACRO-P3 block,
// every enum the UI renders has its message, and no copy uses FORBIDDEN_TERMS (Chinese as substrings, English on word
// boundaries, case-insensitive: the validator's own rule).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import type {Boundary,DiffKind,ExclusionReason,NodeState,NewlySubkind,Regime} from '@/lib/macro/strategy/contract';
import {FORBIDDEN_TERMS} from '@/lib/macro/strategy/explain-validate';
import {KNOWN_FAILURES,REVIEW_SECTIONS,type PanelPhase} from './strategy-view-model';
const load=(l:'zh'|'en'):unknown=>JSON.parse(readFileSync(resolve(process.cwd(),'messages',l,'macroStrategy.json'),'utf8'));
function flat(v:unknown,p=''):[string,string][]{
 if(typeof v==='string')return [[p,v]];
 if(typeof v!=='object'||v===null||Array.isArray(v))throw new Error(`non-string message at ${p}`);
 return Object.entries(v).flatMap(([k,c])=>flat(c,p?`${p}.${k}`:k));
}
const ph=(s:string)=>[...s.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]).sort();
const zh=new Map(flat(load('zh'))),en=new Map(flat(load('en')));
const hits=(text:string)=>FORBIDDEN_TERMS.filter(term=>/[^\x00-\x7f]/.test(term)?text.includes(term):new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text));
const FAMILIES:Record<string,readonly string[]>={
 state:['observed','derived','assumption','missing','restricted','not_in_catalog'] satisfies readonly NodeState[],
 'matrix.exclusion':['incomplete_window','overlap','non_positive_base','missing_endpoint'] satisfies readonly ExclusionReason[],
 'matrix.rows':['hike','cut','qe_qt'],
 'history.missing':['out_of_coverage','degenerate','non_positive_base','history_truncated','month_not_closed'],
 'history.boundary':['event_day','first_trading_day','month_end'] satisfies readonly Boundary[],
 'history.boundaryDef':['event_day','first_trading_day','month_end'] satisfies readonly Boundary[],
 'history.direction':['hike','cut'],
 'review.section':REVIEW_SECTIONS,
 'review.status':['ok','insufficient','none'],
 'explain.state':['none','loading','readError','running','accepted','rejected','failed'] satisfies readonly PanelPhase[],
 'explain.subject':['snapshot','review'],
 'explain.failure':KNOWN_FAILURES,
 'deviation.kind':['revised','dropped','unchanged','newly_available'] satisfies readonly DiffKind[],
 'deviation.subkind':['later_period','backfill','new_series'] satisfies readonly NewlySubkind[],
 'deviation.role':['latest','comparison'],
 'deviation.evidence':['complete','evidence_incomplete'],
 regime:['recovery','overheat','stagflation','recession'] satisfies readonly Regime[],
 'f4.lifecycle':['open','settled','settled_hit','settled_miss','other'],
 region:['US','CN'],
};
describe('macroStrategy messages',()=>{
 it('zh and en have the same keys',()=>{expect([...zh.keys()].sort()).toEqual([...en.keys()].sort());});
 it('placeholders match per key',()=>{for(const [k,v] of zh)expect([k,ph(v)]).toEqual([k,ph(en.get(k)!)]);});
 it('every rendered enum value has a message',()=>{
  for(const [family,values] of Object.entries(FAMILIES))for(const v of values)expect([`${family}.${v}`,zh.has(`${family}.${v}`)]).toEqual([`${family}.${v}`,true]);
 });
 it('no copy uses a forbidden term',()=>{
  for(const [k,v] of [...zh,...en])expect([k,hits(v)]).toEqual([k,[]]);
 });
 it('is registered in MESSAGE_DOMAINS inside a MACRO-P3 block',()=>{
  expect(readFileSync(resolve(process.cwd(),'src/i18n/request.ts'),'utf8')).toMatch(/\/\/ MACRO-P3\n\s*'macroStrategy',\n\s*\/\/ \/MACRO-P3/);
 });
});
