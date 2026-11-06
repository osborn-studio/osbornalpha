// src/lib/dq/reconcile/ixbrl-trim.ts
// Deterministic trimming of a real inline XBRL primary document into a small committed fixture
// (IXBRL_TRIM_VERSION='ixbrl-trim/1'; plan 3 Task 13c). Kept, as verbatim source slices: the root
// element's open tag (every xmlns declaration), each OUTERMOST ix:nonFraction / ix:nonNumeric whose
// resolved concept name passes `keep` (default factConceptKeep: every FACT_CONCEPTS tag plus the three dei
// nonNumeric names), and the xbrli:context / xbrli:unit elements those facts reference. Facts in
// dimensional contexts are dropped unless dropDimensional:false. Output order is source order, one fact
// per <p>, so identical source bytes always give identical trimmed bytes. Uses the same tokenizer and
// namespace resolution as ixbrl.ts, so prefixes do not matter.
import {FACT_CONCEPTS} from '../../facts/concepts';
import {tagsOf} from '../../facts/providers/edgar-companyfacts';
import {DEI_NON_NUMERIC,IxbrlParseError,NS,canonicalConcept,resolveQName,tokenizeXml} from './ixbrl';
import type {NsMap} from './ixbrl';

export const IXBRL_TRIM_VERSION='ixbrl-trim/1';
const KEEP=new Set<string>([...FACT_CONCEPTS.flatMap(c=>tagsOf(c)),...DEI_NON_NUMERIC]);
export const factConceptKeep=(name:string):boolean=>KEEP.has(name);
export interface TrimOptions{keep:(name:string)=>boolean;dropDimensional?:boolean}
export interface TrimResult{html:string;facts:number;contexts:number;units:number}

interface El{name:string;ns:NsMap;uri:string|null;local:string}
interface Span{start:number;end:number}
interface FactSpan extends Span{name:string;contextRef:string;unitRef:string|null}
const attrOf=(a:readonly [string,string][],k:string)=>a.find(([n])=>n===k)?.[1];
const isFact=(el:{uri:string|null;local:string})=>el.uri===NS.ix&&(el.local==='nonFraction'||el.local==='nonNumeric');

export function trimInlineXbrl(doc:string,opts:TrimOptions):TrimResult{
 const dropDimensional=opts.dropDimensional??true;
 const root:NsMap=new Map([['xml',NS.xml]]);const stack:El[]=[];
 let rootOpen:string|null=null,rootName='',headerName:string|null=null,resourcesName:string|null=null;
 const contexts=new Map<string,Span&{dimensional:boolean}>();const units=new Map<string,Span>();const facts:FactSpan[]=[];
 let ctx:{id:string;start:number;dimensional:boolean;segDepth:number}|null=null;
 let unit:{id:string;start:number}|null=null;
 let fact:{depth:number;start:number;name:string;contextRef:string;unitRef:string|null}|null=null;
 const close=(el:El,end:number)=>{
  if(ctx!==null&&el.uri===NS.xbrli&&el.local==='context'){contexts.set(ctx.id,{start:ctx.start,end,dimensional:ctx.dimensional});ctx=null;return;}
  if(ctx!==null&&el.uri===NS.xbrli&&(el.local==='segment'||el.local==='scenario')&&ctx.segDepth===stack.length){ctx.segDepth=-1;return;}
  if(unit!==null&&el.uri===NS.xbrli&&el.local==='unit'){units.set(unit.id,{start:unit.start,end});unit=null;return;}
  if(fact!==null&&stack.length===fact.depth&&isFact(el)){facts.push({...fact,end});fact=null;}
 };
 for(const tok of tokenizeXml(doc)){
  if(tok.t==='text')continue;
  if(tok.t==='close'){
   const el=stack.pop();
   if(!el||el.name!==tok.name)throw new IxbrlParseError('mismatched_close');
   close(el,tok.end);continue;
  }
  const parent=stack.length>0?stack[stack.length-1].ns:root;let ns:NsMap=parent;
  const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
  if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
  const {uri,local}=resolveQName(tok.name,ns,true);
  const el:El={name:tok.name,ns,uri,local};
  if(rootOpen===null){rootOpen=doc.slice(tok.start,tok.end);rootName=tok.name;}
  if(ctx!==null&&ctx.segDepth>=0)ctx.dimensional=true;
  else if(uri===NS.ix&&local==='header'&&headerName===null)headerName=tok.name;
  else if(uri===NS.ix&&local==='resources'&&resourcesName===null)resourcesName=tok.name;
  else if(uri===NS.xbrli&&local==='context')ctx={id:attrOf(tok.attrs,'id')??'',start:tok.start,dimensional:false,segDepth:-1};
  else if(ctx!==null&&uri===NS.xbrli&&(local==='segment'||local==='scenario'))ctx.segDepth=stack.length;
  else if(uri===NS.xbrli&&local==='unit')unit={id:attrOf(tok.attrs,'id')??'',start:tok.start};
  else if(fact===null&&isFact(el)){
   const q=resolveQName((attrOf(tok.attrs,'name')??'').trim(),ns,true);
   fact={depth:stack.length,start:tok.start,name:canonicalConcept(q.uri,q.local),contextRef:attrOf(tok.attrs,'contextRef')??'',unitRef:local==='nonFraction'?(attrOf(tok.attrs,'unitRef')??''):null};
  }
  if(tok.self)close(el,tok.end);else stack.push(el);
 }
 if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
 if(rootOpen===null||headerName===null||resourcesName===null)throw new IxbrlParseError('not_inline_xbrl');
 const kept=facts.filter(f=>{const c=contexts.get(f.contextRef);return opts.keep(f.name)&&c!==undefined&&!(dropDimensional&&c.dimensional);});
 const bySource=(a:Span,b:Span)=>a.start-b.start;
 const keptContexts=[...new Set(kept.map(f=>f.contextRef))].map(id=>contexts.get(id)!).sort(bySource);
 const keptUnits=[...new Set(kept.map(f=>f.unitRef).filter((u):u is string=>u!==null&&units.has(u)))].map(id=>units.get(id)!).sort(bySource);
 const slice=(s:Span)=>doc.slice(s.start,s.end);
 const html=['<?xml version="1.0" encoding="utf-8"?>',`<!-- ${IXBRL_TRIM_VERSION}: ${kept.length} facts -->`,rootOpen,'<head><title>trimmed</title></head>','<body>',
  `<div style="display:none"><${headerName}><${resourcesName}>`,...keptContexts.map(slice),...keptUnits.map(slice),`</${resourcesName}></${headerName}></div>`,
  ...kept.map(f=>`<p>${slice(f)}</p>`),'</body>',`</${rootName}>`,''].join('\n');
 return {html,facts:kept.length,contexts:keptContexts.length,units:keptUnits.length};
}
