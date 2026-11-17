// Strict LLM extraction shape and Unicode quote limit (spec §5.2).
import {describe,it,expect} from 'vitest';
import {QUOTE_MAX_CHARS,validateExtraction} from './schema';
import fixture from '../fixtures/synthetic-extraction.json';
const clone=()=>structuredClone(fixture) as Record<string,any>;
describe('extract-schema/1 (spec §5.2)',()=>{
 it('accepts the synthetic fixture',()=>{expect(validateExtraction(clone()).ok).toBe(true);});
 it('accepts a minimal sector report with no targets and no analysts',()=>{const e={value:'x',page:1,quote:'x',confidence:0};expect(validateExtraction({scope:'sector',institution:e,analysts:[],published_date:e,title:e,targets:[]}).ok).toBe(true);});
 it('rejects additional properties at every level',()=>{const top=clone();top.extra=1;const ev=clone();ev.institution.note='x';const tg=clone();tg.targets[0].latest_price={value:'1',page:1,quote:'1',confidence:1};for(const v of [top,ev,tg]){const r=validateExtraction(v);expect(r.ok).toBe(false);if(!r.ok)expect(r.errors.join(';')).toContain('must NOT have additional properties');}});
 it('requires the top-level and target keys',()=>{for(const k of ['scope','institution','analysts','published_date','title','targets']){const v=clone();delete v[k];expect(validateExtraction(v).ok).toBe(false);}const v=clone();delete v.targets[0].ticker;expect(validateExtraction(v).ok).toBe(false);});
 it('enforces Evidence bounds: page ≥ 1 integer, confidence 0..1, non-empty quote ≤ 400',()=>{const bad=[(v:any)=>{v.title.page=0;},(v:any)=>{v.title.page=1.5;},(v:any)=>{v.title.confidence=1.01;},(v:any)=>{v.title.confidence=-0.1;},(v:any)=>{v.title.quote='';},(v:any)=>{v.title.quote='a'.repeat(QUOTE_MAX_CHARS+1);},(v:any)=>{v.title.value='';},(v:any)=>{v.scope='company';},(v:any)=>{v.analysts=[{value:'x',page:1,quote:'x'}];},(v:any)=>{v.targets[0].exchange_hint='';}];for(const f of bad){const v=clone();f(v);expect(validateExtraction(v).ok).toBe(false);}const ok=clone();ok.title.quote='字'.repeat(QUOTE_MAX_CHARS);expect(validateExtraction(ok).ok).toBe(true);});
 it('counts the quote cap in code points (an astral char is one)',()=>{const v=clone();v.title.quote='🚀'.repeat(QUOTE_MAX_CHARS);expect(validateExtraction(v).ok).toBe(true);});
 it('reports error paths',()=>{const v=clone();v.targets[1].target_price.page='2';const r=validateExtraction(v);expect(r.ok).toBe(false);if(!r.ok)expect(r.errors).toContain('/targets/1/target_price/page must be integer');const root=validateExtraction(null);expect(root.ok).toBe(false);if(!root.ok)expect(root.errors[0]).toMatch(/^\/ /);});
});
