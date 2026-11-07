// src/components/judgments/ui-source.test.ts
// Task 21 (spec §9.5, DESIGN.md): source-level guards for the judgment UI files that the node-env vitest cannot render
// (the repo's tsconfig keeps jsx: preserve): real buttons with an explicit type, no click handlers on non-interactive
// elements, accessible dialogs / svgs / tables, no gradients or purple, brass only through view-model.ts, the admin page
// gate, and every judgments message key used by these files present in zh and en with matching placeholders.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const C='src/components/judgments/';
const FILES=[`${C}JudgmentCard.tsx`,`${C}InputsDrawer.tsx`,`${C}SettlementTimeline.tsx`,`${C}CalibrationBadge.tsx`,`${C}ReliabilityTable.tsx`,`${C}ConfidenceCell.tsx`,`${C}SelfAssessmentPanel.tsx`,
 'src/app/(app)/intel/methods/page.tsx','src/app/(app)/intel/methods/[id]/[version]/page.tsx','src/app/(app)/admin/judgments/page.tsx','src/app/(app)/admin/judgments/AdminJudgmentsClient.tsx'];
const ALL=[...FILES,`${C}view-model.ts`,`${C}analyst-view.ts`,`${C}api-types.ts`];
const src=(f:string)=>readFileSync(f,'utf8');
const messages=(l:'zh'|'en')=>JSON.parse(readFileSync(`messages/${l}/judgments.json`,'utf8')) as Record<string,unknown>;
const get=(o:unknown,path:string)=>path.split('.').reduce<unknown>((a,k)=>a&&typeof a==='object'?(a as Record<string,unknown>)[k]:undefined,o);
function keys(v:unknown,prefix=''):string[]{if(typeof v!=='object'||v===null||Array.isArray(v))return [prefix];return Object.entries(v).flatMap(([k,c])=>keys(c,prefix?`${prefix}.${k}`:k));}
const placeholders=(s:string)=>[...s.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]).sort();
const TYPES=['macro_regime','macro_regime_asset_pair','recommendation_call','industry_lifecycle_stage','industry_prosperity','valuation_verdict','thesis_win_rate','return_range','sellside_rating','sellside_target_price','synthetic_fact_metric'];
const DYNAMIC=[
 ...TYPES.map(t=>`ui.type.${t}`),...['all','probability','categorical','score','interval'].map(k=>`ui.kind.${k}`),...['all','macro','industry','company','private'].map(d=>`ui.domain.${d}`),
 ...['draft','active','retired'].map(s=>`ui.status.${s}`),...['low','mid','high'].map(b=>`ui.band.${b}`),...['recovery','overheat','stagflation','recession'].map(c=>`ui.classes.${c}`),
 ...['abstained','open','settled','void','withdrawn','pending_fill','hit','miss'].map(l=>`ui.lifecycle.${l}`),
 ...['financial_fact','financial_metric','macro_observation','macro_snapshot','price_bar','table_rows','judgment','legacy_fill','document_span'].map(k=>`ui.inputKind.${k}`),
 ...['void','withdrawn','reopened'].flatMap(k=>[`ui.card.reason.${k}`,`ui.timeline.${k}`]),
 ...['due','backoff','leased','all'].map(f=>`ui.admin.filters.${f}`),...['pending','unavailable','inconsistent','error'].map(s=>`ui.admin.lastStatus.${s}`),
 ...['not_due','leased','closed'].map(s=>`ui.admin.settleDisabled.${s}`),...['settle','withdraw','reopen','withdrawTitle','reopenTitle'].map(s=>`ui.admin.${s}`),
];

describe('judgment UI source guards (Task 21)',()=>{
 it('every <button> declares its type first; no click handlers on non-interactive elements',()=>{
  for(const f of FILES){
   const s=src(f);
   expect({f,untyped:(s.match(/<button(?!\s+type=)/g)??[]).length}).toEqual({f,untyped:0});
   expect({f,clickable:/<(div|span|li|tr|td|section|article|p|ul|ol|dl)\b[^>]*\bonClick=/.test(s)}).toEqual({f,clickable:false});
  }
 });
 it('dialogs are modal and labelled; svgs are images with labels or hidden; tables have captions and scoped headers',()=>{
  for(const f of FILES){
   const s=src(f);
   for(const m of s.match(/<section role="dialog"[^>]*>/g)??[])expect({f,m,ok:/aria-modal="true"/.test(m)&&/aria-labelledby=/.test(m)}).toEqual({f,m,ok:true});
   for(const m of s.match(/<svg\b[^>]*>/g)??[])expect({f,m,ok:/role="img"[^>]*aria-label=|aria-hidden="true"/.test(m)}).toEqual({f,m,ok:true});
   expect({f,tables:(s.match(/<table\b/g)??[]).length,captions:(s.match(/<caption\b/g)??[]).length}).toEqual({f,tables:(s.match(/<table\b/g)??[]).length,captions:(s.match(/<table\b/g)??[]).length});
   expect({f,unscoped:(s.match(/<th(?![^>]*scope=)[ >]/g)??[]).length}).toEqual({f,unscoped:0});
  }
 });
 it('no gradients, no purple / violet / indigo; brass (accent) classes only in view-model.ts',()=>{
  for(const f of ALL){
   const s=src(f);
   expect({f,banned:/gradient|purple|violet|indigo/i.test(s)}).toEqual({f,banned:false});
   if(f!==`${C}view-model.ts`)expect({f,accent:/--accent|text-accent|bg-accent|border-accent|accent-dim/.test(s)}).toEqual({f,accent:false});
  }
 });
 it("'use client' exactly where hooks or handlers are used; the admin page is a gated, dynamic server component",()=>{
  for(const f of FILES){
   const s=src(f);const interactive=/\buse(State|Effect|Callback|Ref|Id)\b|onClick=|onSubmit=/.test(s);
   expect({f,client:s.startsWith("'use client'")}).toEqual({f,client:interactive});
  }
  const admin=src('src/app/(app)/admin/judgments/page.tsx');
  for(const needle of ['requireAdminUser()','AdminForbidden','AdminUnauthenticated',"redirect('/login?next=%2Fadmin%2Fjudgments')","export const dynamic = 'force-dynamic'"])expect({needle,found:admin.includes(needle)}).toEqual({needle,found:true});
 });
 it('every ui.* key used (literal and enumerated dynamic) exists in zh and en; the ui subtree is in parity with matching placeholders',()=>{
  const zh=messages('zh'),en=messages('en');
  const literal=[...new Set(ALL.flatMap(f=>[...src(f).matchAll(/['`](ui\.[A-Za-z0-9_.]+)['`]/g)].map(m=>m[1])))].filter(k=>!k.endsWith('.'));
  for(const k of [...literal,...DYNAMIC])expect({k,zh:typeof get(zh,k),en:typeof get(en,k)}).toEqual({k,zh:'string',en:'string'});
  expect(keys(zh.ui).sort()).toEqual(keys(en.ui).sort());
  for(const k of keys(zh.ui))expect({k,p:placeholders(String(get(zh.ui,k)))}).toEqual({k,p:placeholders(String(get(en.ui,k)))});
 });
});

describe('interaction safeguards',()=>{
 it('dialogs use the browser modal focus boundary and reason length matches the route',()=>{
  for(const file of [`${C}InputsDrawer.tsx`,'src/app/(app)/admin/judgments/AdminJudgmentsClient.tsx']){
   expect(src(file)).toContain('.showModal()');
   expect(src(file)).toContain('<dialog');
   expect(src(file)).toContain('onCancel=');
  }
  expect(src('src/app/(app)/admin/judgments/AdminJudgmentsClient.tsx')).toContain('maxLength={500}');
 });
 it('queue supports pagination, bounded counts and incident links independent of last_status',()=>{
  const s=src('src/app/(app)/admin/judgments/AdminJudgmentsClient.tsx');
  expect(s).toContain('next_after');
  expect(s).toContain('last_detail.incident');
  expect(s).toContain('500+');
 });
});
