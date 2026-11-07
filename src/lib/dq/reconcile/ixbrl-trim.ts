// src/lib/dq/reconcile/ixbrl-trim.ts
// Deterministic trimming of a real inline XBRL primary document into a small committed fixture
// (IXBRL_TRIM_VERSION='ixbrl-trim/1'; plan 3 Task 13c). Kept, as verbatim source slices: the root
// element's open tag (every xmlns declaration), each selected ix:nonFraction / ix:nonNumeric (every
// nesting level; a selected fact inside an unselected one is kept on its own), and the xbrli:context /
// xbrli:unit elements that every fact inside a kept slice references. Each slice is emitted with the
// in-scope xmlns bindings it had in the source (from all ancestors), so prefixes inside it (concept
// names, QName-valued measures) still resolve. Facts in dimensional contexts are dropped unless
// dropDimensional:false. Duplicate context / unit ids are all kept (the document stays unsupported
// exactly as the source was); a selected fact inside ix:tuple (or with tupleRef) makes the trim refuse
// (trim_tuple_member). Safety net: the original and the trimmed document are both parsed with
// parseInlineXbrl and, for every selected concept, facts (key, value, decimals), dei texts and
// unsupported entries must be identical, otherwise trim_not_equivalent. Output order is source order,
// one fact per <p>, so identical source bytes always give identical trimmed bytes.
import {FACT_CONCEPTS} from '../../facts/concepts';
import {tagsOf} from '../../facts/providers/edgar-companyfacts';
import {DEI_NON_NUMERIC,IxbrlParseError,NS,canonicalConcept,ixFactKey,parseInlineXbrl,resolveQName,tokenizeXml} from './ixbrl';
import type {IxbrlDocument,NsMap} from './ixbrl';

export const IXBRL_TRIM_VERSION='ixbrl-trim/1';
const KEEP=new Set<string>([...FACT_CONCEPTS.flatMap(c=>tagsOf(c)),...DEI_NON_NUMERIC]);
export const factConceptKeep=(name:string):boolean=>KEEP.has(name);
export interface TrimOptions{keep:(name:string)=>boolean;dropDimensional?:boolean}
export interface TrimResult{html:string;facts:number;contexts:number;units:number}

/** code is 'trim_not_equivalent' | 'trim_tuple_member' (plus the parser's own codes); detail names differing keys. */
export class TrimError extends IxbrlParseError{constructor(code:string,public readonly detail:string[]=[]){super(detail.length>0?`${code}: ${detail.join('; ')}`:code);this.name='TrimError';}}

interface El{name:string;ns:NsMap;uri:string|null;local:string}
interface Span{start:number;end:number;openEnd:number;parentNs:NsMap;own:Set<string>}
interface CtxSpan extends Span{dimensional:boolean}
interface FactSpan extends Span{kind:'nf'|'nn';name:string;contextRef:string;unitRef:string|null;tuple:boolean}
const attrOf=(a:readonly [string,string][],k:string)=>a.find(([n])=>n===k)?.[1];
const isFact=(el:{uri:string|null;local:string})=>el.uri===NS.ix&&(el.local==='nonFraction'||el.local==='nonNumeric');
const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const declOf=(attrs:readonly [string,string][])=>new Set(attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:')).map(([k])=>k==='xmlns'?'':k.slice(6)));
/** xmlns attributes for the bindings in `ns` that differ from `base` (and are not redeclared in `skip`). */
function declsFor(ns:NsMap,base:NsMap,skip?:ReadonlySet<string>):string{
 let s='';
 for(const [p,u] of ns){
  if(p==='xml'||base.get(p)===u||skip?.has(p))continue;
  s+=p===''?` xmlns="${esc(u)}"`:` xmlns:${p}="${esc(u)}"`;
 }
 return s;
}
/** Source slice with extra xmlns attributes inserted into its own open tag. */
function sliceWith(doc:string,s:Span,base:NsMap):string{
 const add=declsFor(s.parentNs,base,s.own);
 if(add==='')return doc.slice(s.start,s.end);
 const open=doc.slice(s.start,s.openEnd);
 const cut=open.endsWith('/>')?open.length-2:open.length-1;
 return open.slice(0,cut)+add+open.slice(cut)+doc.slice(s.openEnd,s.end);
}

export function trimInlineXbrl(doc:string,opts:TrimOptions):TrimResult{
 const dropDimensional=opts.dropDimensional??true;
 const root:NsMap=new Map([['xml',NS.xml]]);const stack:El[]=[];
 let rootOpen:string|null=null,rootName='',rootNs:NsMap=root;
 let header:{name:string;ns:NsMap}|null=null,resources:{name:string;ns:NsMap}|null=null;
 const contexts=new Map<string,CtxSpan[]>();const units=new Map<string,Span[]>();const facts:FactSpan[]=[];
 let ctx:(CtxSpan&{id:string;segDepth:number})|null=null;
 let unit:(Span&{id:string})|null=null;
 const open:(Omit<FactSpan,'end'>&{depth:number})[]=[];
 let tuples=0;
 const push=<T>(m:Map<string,T[]>,k:string,v:T)=>{const a=m.get(k);if(a)a.push(v);else m.set(k,[v]);};
 const close=(el:El,end:number)=>{
  if(ctx!==null&&el.uri===NS.xbrli&&el.local==='context'){push(contexts,ctx.id,{start:ctx.start,end,openEnd:ctx.openEnd,parentNs:ctx.parentNs,own:ctx.own,dimensional:ctx.dimensional});ctx=null;return;}
  if(ctx!==null&&el.uri===NS.xbrli&&(el.local==='segment'||el.local==='scenario')&&ctx.segDepth===stack.length){ctx.segDepth=-1;return;}
  if(unit!==null&&el.uri===NS.xbrli&&el.local==='unit'){push(units,unit.id,{start:unit.start,end,openEnd:unit.openEnd,parentNs:unit.parentNs,own:unit.own});unit=null;return;}
  const top=open[open.length-1];
  if(top&&stack.length===top.depth&&isFact(el)){open.pop();const {depth:_d,...f}=top;void _d;facts.push({...f,end});}
  if(el.uri===NS.ix&&el.local==='tuple')tuples=Math.max(0,tuples-1);
 };
 for(const tok of tokenizeXml(doc)){
  if(tok.t==='text')continue;
  if(tok.t==='close'){
   const el=stack.pop();
   if(!el||el.name!==tok.name)throw new IxbrlParseError('mismatched_close');
   close(el,tok.end);continue;
  }
  const parentNs=stack.length>0?stack[stack.length-1].ns:root;let ns:NsMap=parentNs;
  const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
  if(decl.length>0){const m=new Map(parentNs);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
  const {uri,local}=resolveQName(tok.name,ns,true);
  const el:El={name:tok.name,ns,uri,local};
  const span={start:tok.start,openEnd:tok.end,parentNs,own:declOf(tok.attrs)};
  if(rootOpen===null){rootOpen=doc.slice(tok.start,tok.end);rootName=tok.name;rootNs=ns;}
  if(ctx!==null&&ctx.segDepth>=0)ctx.dimensional=true;
  else if(uri===NS.ix&&local==='header'&&header===null)header={name:tok.name,ns};
  else if(uri===NS.ix&&local==='resources'&&resources===null)resources={name:tok.name,ns};
  else if(uri===NS.xbrli&&local==='context'&&ctx===null)ctx={...span,end:0,id:attrOf(tok.attrs,'id')??'',dimensional:false,segDepth:-1};
  else if(ctx!==null&&uri===NS.xbrli&&(local==='segment'||local==='scenario'))ctx.segDepth=stack.length;
  else if(uri===NS.xbrli&&local==='unit'&&unit===null)unit={...span,end:0,id:attrOf(tok.attrs,'id')??''};
  else if(isFact(el)){
   const q=resolveQName((attrOf(tok.attrs,'name')??'').trim(),ns,true);
   open.push({...span,depth:stack.length,kind:local==='nonFraction'?'nf':'nn',name:canonicalConcept(q.uri,q.local),contextRef:attrOf(tok.attrs,'contextRef')??'',
    unitRef:local==='nonFraction'?(attrOf(tok.attrs,'unitRef')??''):null,tuple:tuples>0||attrOf(tok.attrs,'tupleRef')!==undefined});
  }
  if(uri===NS.ix&&local==='tuple'&&!tok.self)tuples++;
  if(tok.self)close(el,tok.end);else stack.push(el);
 }
 if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
 if(rootOpen===null||header===null||resources===null)throw new IxbrlParseError('not_inline_xbrl');

 facts.sort((a,b)=>a.start-b.start);
 const dropped=(f:FactSpan)=>{
  if(f.kind==='nn'||!dropDimensional)return false;
  const cs=contexts.get(f.contextRef);
  return cs!==undefined&&cs.length===1&&cs[0].dimensional;   // duplicates stay: the parser reports them whatever their content
 };
 const kept=facts.filter(f=>opts.keep(f.name)&&!dropped(f));
 if(kept.some(f=>f.tuple))throw new TrimError('trim_tuple_member',kept.filter(f=>f.tuple).map(f=>f.name));
 // emitted slices: kept facts not already inside an earlier emitted slice
 const emitted:FactSpan[]=[];let lastEnd=-1;
 for(const f of kept)if(f.start>=lastEnd){emitted.push(f);lastEnd=f.end;}
 const inside=facts.filter(f=>emitted.some(e=>f.start>=e.start&&f.end<=e.end));
 const ctxIds=new Set<string>(),unitIds=new Set<string>();
 for(const f of inside){
  if(f.contextRef!==''&&contexts.has(f.contextRef))ctxIds.add(f.contextRef);   // every fact physically inside a kept slice, dimensional or not
  if(f.unitRef!==null&&f.unitRef!==''&&units.has(f.unitRef))unitIds.add(f.unitRef);
 }
 const bySource=(a:Span,b:Span)=>a.start-b.start;
 const keptContexts=[...ctxIds].flatMap(id=>contexts.get(id)!).sort(bySource);
 const keptUnits=[...unitIds].flatMap(id=>units.get(id)!).sort(bySource);
 const resourcesNs=resources.ns;
 const wrap=(s:Span)=>sliceWith(doc,s,resourcesNs);   // contexts and units are emitted inside <resources>
 const html=['<?xml version="1.0" encoding="utf-8"?>',`<!-- ${IXBRL_TRIM_VERSION}: ${kept.length} facts -->`,rootOpen,'<head><title>trimmed</title></head>','<body>',
  `<div style="display:none"><${header.name}${declsFor(header.ns,rootNs)}><${resources.name}${declsFor(resources.ns,header.ns)}>`,...keptContexts.map(wrap),...keptUnits.map(wrap),`</${resources.name}></${header.name}></div>`,
  ...emitted.map(f=>`<p${declsFor(f.parentNs,rootNs)}>${doc.slice(f.start,f.end)}</p>`),'</body>',`</${rootName}>`,''].join('\n');

 // safety net
 const diff=equivalence(parseInlineXbrl(doc),parseInlineXbrl(html),opts.keep);
 if(diff.length>0)throw new TrimError('trim_not_equivalent',diff.slice(0,10));
 return {html,facts:kept.length,contexts:keptContexts.length,units:keptUnits.length};
}

/** Keys that differ between the original and trimmed parses, restricted to the selected concepts. */
export function equivalence(a:IxbrlDocument,b:IxbrlDocument,keep:(n:string)=>boolean):string[]{
 const facts=(d:IxbrlDocument)=>d.facts.filter(f=>keep(f.name)).map(f=>`fact ${ixFactKey(f)}=${f.value}@${f.decimals??''}`);
 const nn=(d:IxbrlDocument)=>Object.entries(d.nonNumeric).filter(([k])=>keep(k)).map(([k,v])=>`nonNumeric ${k}=${v}`);
 const uns=(d:IxbrlDocument)=>d.unsupported.filter(u=>u.name!==undefined&&keep(u.name)).map(u=>`unsupported ${JSON.stringify([u.reason,u.name,u.contextRef??'',u.periodStart??'',u.periodEnd??''])}`);
 const out:string[]=[];
 for(const pick of [facts,nn,uns]){
  const x=pick(a).sort(),y=pick(b).sort();
  const cnt=(l:string[])=>{const m=new Map<string,number>();for(const k of l)m.set(k,(m.get(k)??0)+1);return m;};
  const cx=cnt(x),cy=cnt(y);
  for(const k of new Set([...cx.keys(),...cy.keys()]))if(cx.get(k)!==cy.get(k))out.push(`${k} (original ${cx.get(k)??0}, trimmed ${cy.get(k)??0})`);
 }
 return out;
}
