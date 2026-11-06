// src/lib/dq/reconcile/ixbrl.ts
// Inline XBRL subset parser (spec §5.2), IXBRL_PARSER_VERSION='ixbrl/1'.
// A bounded streaming XML tokenizer (elements, attributes, the five XML entities plus &nbsp; and numeric
// character references; comments, processing instructions and a DOCTYPE WITHOUT internal subset are
// skipped; an internal DTD subset is refused; CDATA is literal text; script/style content is raw text;
// depth <= 1000, attributes <= 256 per element) feeds a parser that resolves every element name and every
// QName value through the in-scope xmlns declarations, so prefixes never matter.
// Supported subset (each has a test); everything else lands in `unsupported` and is never merged:
//  - xbrli:context: entity/identifier; period startDate+endDate | instant, dates YYYY-MM-DD. ANY child
//    element inside segment or scenario marks the context dimensional and its facts are skipped (out of
//    scope by design, not reported). Facts carry (entity, period), so equal contexts with different ids
//    give the same key (ixFactKey) — the normalised dedupe.
//  - xbrli:unit: one measure, or divide with exactly one numerator and one denominator measure; iso4217
//    and xbrli measures become USD / shares / pure, then facts/units.ts normalizeUnit ('USD/shares' →
//    'USD/share'); anything else → unsupported(unit).
//  - ix:nonFraction: name, contextRef, unitRef, scale, sign, decimals, format, xsi:nil. Text grammar by
//    format (transformation registries 2015-02-26, 2020-02-12, 2022-02-16 only):
//      (no format), num-dot-decimal, numdotdecimal   ^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$   commas dropped
//      num-comma-decimal, numcommadecimal            ^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$    dots dropped, comma = point
//      fixed-zero, zerodash                          → 0
//      numwordsen                                    'no' | 'none' (trimmed, case-insensitive) → 0
//    any other format or no match → unsupported(format); xsi:nil = true|1 → unsupported(nil).
//    value = canonical decimal × 10^scale, negated when sign='-'. A nested ix:nonFraction gives the outer
//    fact the innermost text; text inside ix:exclude is not fact text.
//  - ix:nonNumeric: only dei:EntityFilerCategory, dei:DocumentFiscalYearFocus, dei:DocumentPeriodEndDate
//    (whitespace-collapsed raw text; a second, different text → unsupported(nonnumeric_conflict)).
//  - ix:fraction, ix:tuple and facts with tupleRef → unsupported. No ix element at all → not_inline_xbrl.
// Malformed XML throws IxbrlParseError(code); the pair turns that into unsupported results.
import {canonicalDecimal} from '../../facts/json-numbers';
import {normalizeUnit} from '../../facts/units';

export const IXBRL_PARSER_VERSION='ixbrl/1';
export const MAX_IXBRL_BYTES=50*1024*1024;
export const NS={ix:'http://www.xbrl.org/2013/inlineXBRL',xbrli:'http://www.xbrl.org/2003/instance',xbrldi:'http://xbrl.org/2006/xbrldi',xsi:'http://www.w3.org/2001/XMLSchema-instance',iso4217:'http://www.xbrl.org/2003/iso4217',xml:'http://www.w3.org/XML/1998/namespace'} as const;
export const TRANSFORM_NS:readonly string[]=['http://www.xbrl.org/inlineXBRL/transformation/2015-02-26','http://www.xbrl.org/inlineXBRL/transformation/2020-02-12','http://www.xbrl.org/inlineXBRL/transformation/2022-02-16'];
export const DEI_NON_NUMERIC:readonly string[]=['dei:EntityFilerCategory','dei:DocumentFiscalYearFocus','dei:DocumentPeriodEndDate'];

export interface IxFact{name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number;entity:string;contextRef:string;unitRef:string}
export interface IxUnsupported{reason:string;name?:string;contextRef?:string;periodStart?:string|null;periodEnd?:string}
export interface IxbrlDocument{facts:IxFact[];nonNumeric:Record<string,string>;unsupported:IxUnsupported[]}
export class IxbrlParseError extends Error{constructor(public readonly code:string){super(code);this.name='IxbrlParseError';}}

// ---------------- tokenizer ----------------
export type XmlToken=
 |{t:'open';name:string;attrs:[string,string][];self:boolean;start:number;end:number}
 |{t:'close';name:string;start:number;end:number}
 |{t:'text';text:string;start:number;end:number};
const MAX_DEPTH=1000,MAX_ATTRS=256;
const NAME_RE=/[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y;
const NAMED:Record<string,string>={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",nbsp:' '};
const fail=(code:string):never=>{throw new IxbrlParseError(code);};
const isWs=(c:number)=>c===32||c===9||c===10||c===13;
function nameAt(doc:string,at:number):string|null{NAME_RE.lastIndex=at;const m=NAME_RE.exec(doc);return m?m[0]:null;}

export function decodeEntities(s:string):string{
 if(!s.includes('&'))return s;
 return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,31});/g,(m,b:string)=>{
  if(b[0]!=='#')return NAMED[b]??m;
  const cp=b[1]==='x'||b[1]==='X'?Number.parseInt(b.slice(2),16):Number.parseInt(b.slice(1),10);
  return cp>0&&cp<=0x10ffff&&(cp<0xd800||cp>0xdfff)?String.fromCodePoint(cp):m;
 });
}

/** Streaming tokens with source offsets [start, end). Throws IxbrlParseError on malformed markup. */
export function* tokenizeXml(doc:string):Generator<XmlToken>{
 const n=doc.length;let i=doc.charCodeAt(0)===0xfeff?1:0;let depth=0;let rawEnd:string|null=null;let lower:string|null=null;
 while(i<n){
  if(rawEnd!==null){
   lower??=doc.toLowerCase();
   const e=lower.indexOf(rawEnd,i);if(e<0)fail('unterminated_raw_text');
   if(e>i)yield {t:'text',text:doc.slice(i,e),start:i,end:e};
   rawEnd=null;i=e;continue;
  }
  const lt=doc.indexOf('<',i);
  if(lt<0){yield {t:'text',text:decodeEntities(doc.slice(i)),start:i,end:n};break;}
  if(lt>i)yield {t:'text',text:decodeEntities(doc.slice(i,lt)),start:i,end:lt};
  if(doc.startsWith('<!--',lt)){const e=doc.indexOf('-->',lt+4);if(e<0)fail('unterminated_comment');i=e+3;continue;}
  if(doc.startsWith('<![CDATA[',lt)){const e=doc.indexOf(']]>',lt+9);if(e<0)fail('unterminated_cdata');yield {t:'text',text:doc.slice(lt+9,e),start:lt,end:e+3};i=e+3;continue;}
  if(doc.startsWith('<?',lt)){const e=doc.indexOf('?>',lt+2);if(e<0)fail('unterminated_pi');i=e+2;continue;}
  if(doc.startsWith('<!',lt)){const e=doc.indexOf('>',lt+2);if(e<0)fail('unterminated_declaration');if(doc.slice(lt,e).includes('['))fail('dtd_unsupported');i=e+1;continue;}
  if(doc.charCodeAt(lt+1)===47){
   const name=nameAt(doc,lt+2)??fail('bad_close_tag');
   let j=lt+2+name.length;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='>')fail('bad_close_tag');
   depth--;if(depth<0)fail('unbalanced_close');
   yield {t:'close',name,start:lt,end:j+1};i=j+1;continue;
  }
  const name=nameAt(doc,lt+1)??fail('bad_open_tag');
  let j=lt+1+name.length;const attrs:[string,string][]=[];let self=false;
  for(;;){
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(j>=n)fail('unterminated_tag');
   if(doc.startsWith('/>',j)){self=true;j+=2;break;}
   if(doc[j]==='>'){j++;break;}
   const an=nameAt(doc,j)??fail('bad_attribute');j+=an.length;
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='=')fail('bad_attribute');
   j++;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   const q=doc[j];if(q!=='"'&&q!=="'")fail('bad_attribute');
   const e=doc.indexOf(q,j+1);if(e<0)fail('unterminated_attribute');
   attrs.push([an,decodeEntities(doc.slice(j+1,e))]);j=e+1;
   if(attrs.length>MAX_ATTRS)fail('too_many_attributes');
  }
  yield {t:'open',name,attrs,self,start:lt,end:j};
  if(!self){
   depth++;if(depth>MAX_DEPTH)fail('too_deep');
   const local=name.slice(name.indexOf(':')+1).toLowerCase();
   if(local==='script'||local==='style')rawEnd=`</${name.toLowerCase()}`;
  }
  i=j;
 }
 if(rawEnd!==null)fail('unterminated_raw_text');
}

// ---------------- names ----------------
export type NsMap=ReadonlyMap<string,string>;   // prefix ('' = default namespace) → URI
/** Element names and QName values use the default namespace when unprefixed (useDefault); plain attribute names never do. */
export function resolveQName(q:string,ns:NsMap,useDefault:boolean):{uri:string|null;local:string}{
 const k=q.indexOf(':');
 if(k<0)return {uri:useDefault?(ns.get('')??null):null,local:q};
 const p=q.slice(0,k);
 return {uri:p==='xml'?NS.xml:(ns.get(p)??null),local:q.slice(k+1)};
}
/** Canonical concept name: us-gaap / dei / ifrs-full / srt by namespace URI pattern (any taxonomy year), else Clark notation {uri}local. */
export function canonicalConcept(uri:string|null,local:string):string{
 if(uri!==null){
  if(/^http:\/\/fasb\.org\/us-gaap\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `us-gaap:${local}`;
  if(/^http:\/\/xbrl\.sec\.gov\/dei\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `dei:${local}`;
  if(/^https?:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full$/.test(uri))return `ifrs-full:${local}`;
  if(/^http:\/\/fasb\.org\/srt\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `srt:${local}`;
 }
 return `{${uri??''}}${local}`;
}
const attrOf=(attrs:readonly [string,string][],name:string)=>attrs.find(([k])=>k===name)?.[1];
function nsAttr(attrs:readonly [string,string][],ns:NsMap,uri:string,local:string):string|undefined{
 for(const [k,v] of attrs){
  const i=k.indexOf(':');if(i<0)continue;
  const p=k.slice(0,i);if(p==='xmlns')continue;
  if(ns.get(p)===uri&&k.slice(i+1)===local)return v;
 }
 return undefined;
}

// ---------------- values ----------------
const RE_DOT=/^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$/;
const RE_COMMA=/^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$/;
/** Digits (no exponent) for a format's text, or null when the text does not match the format's grammar. */
export function parseFactText(format:string,text:string):string|null{
 switch(format){
  case 'none':case 'num-dot-decimal':case 'numdotdecimal':return RE_DOT.test(text)?text.replace(/[\s,]/g,''):null;
  case 'num-comma-decimal':case 'numcommadecimal':return RE_COMMA.test(text)?text.replace(/[\s.]/g,'').replace(',','.'):null;
  case 'fixed-zero':case 'zerodash':return '0';
  case 'numwordsen':{const t=text.trim().toLowerCase();return t==='no'||t==='none'?'0':null;}
  default:return null;
 }
}
function formatOf(q:string|undefined,ns:NsMap):string|null{
 if(q===undefined)return 'none';
 const r=resolveQName(q.trim(),ns,true);
 return r.uri!==null&&TRANSFORM_NS.includes(r.uri)?r.local:null;
}
/** Right-side key of a fact: (concept, canonical context = entity + period, unit). */
export const ixFactKey=(f:Pick<IxFact,'name'|'entity'|'periodStart'|'periodEnd'|'unit'>)=>[f.name,f.entity,f.periodStart??'',f.periodEnd,f.unit].join('|');
/** Facts grouped by ixFactKey with their DISTINCT values (canonical decimal equality), in document order. */
export function indexIxFacts(facts:readonly IxFact[]):Map<string,{values:string[];facts:IxFact[]}>{
 const out=new Map<string,{values:string[];facts:IxFact[]}>();
 for(const f of facts){
  const k=ixFactKey(f);const g=out.get(k)??{values:[],facts:[]};
  if(!g.values.includes(f.value))g.values.push(f.value);
  g.facts.push(f);out.set(k,g);
 }
 return out;
}

// ---------------- parser ----------------
interface Frame{name:string;ns:NsMap;uri:string|null;local:string}
interface RawCtx{id:string;scheme:string;ident:string;start:string;end:string;instant:string;forever:boolean;dimensional:boolean}
interface RawUnit{id:string;measures:string[];num:string[];den:string[]}
interface FactFrame{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;inner:string|null}
interface RawFact{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string}
/**
 * Mutable parser state, one explicitly typed object (plan audit P7): the open/close callbacks and the token
 * loop all read and write it through `st.*`. Closure `let`s assigned inside callbacks are invisible to the
 * loop's control-flow analysis (TS narrows them to their initial null/false → `never`, TS2322/TS2339 under
 * strict 5.9); property reads of a typed object are narrowed per use instead.
 */
interface ParseState{
 sawIx:boolean;exclude:number;
 ctx:RawCtx|null;ctxField:'ident'|'start'|'end'|'instant'|null;segDepth:number;
 unit:RawUnit|null;unitPart:'num'|'den'|null;measure:{ns:NsMap;text:string}|null;
}
const DATE=/^\d{4}-\d{2}-\d{2}$/;

function periodOf(c:RawCtx):{start:string|null;end:string}|null{
 if(c.forever)return null;
 const s=c.start.trim(),e=c.end.trim(),i=c.instant.trim();
 if(i!==''&&s===''&&e==='')return DATE.test(i)?{start:null,end:i}:null;
 if(i===''&&DATE.test(s)&&DATE.test(e)&&s<=e)return {start:s,end:e};
 return null;
}
function unitString(u:RawUnit):string|null{
 if(u.num.length>0||u.den.length>0)return u.num.length===1&&u.den.length===1&&u.measures.length===0?`${u.num[0]}/${u.den[0]}`:null;
 return u.measures.length===1?u.measures[0]:null;
}

export function parseInlineXbrl(doc:string):IxbrlDocument{
 const out:IxbrlDocument={facts:[],nonNumeric:{},unsupported:[]};
 const root:NsMap=new Map([['xml',NS.xml]]);
 const stack:Frame[]=[];
 const contexts=new Map<string,RawCtx>();const units=new Map<string,RawUnit>();const rawFacts:RawFact[]=[];
 const open:FactFrame[]=[];
 const st:ParseState={sawIx:false,exclude:0,ctx:null,ctxField:null,segDepth:-1,unit:null,unitPart:null,measure:null};

 const onOpen=(f:Frame,attrs:[string,string][])=>{
  if(st.ctx!==null&&st.segDepth>=0){st.ctx.dimensional=true;return;}   // any element inside segment / scenario
  if(f.uri===NS.ix){
   st.sawIx=true;
   if(f.local==='nonFraction'||f.local==='nonNumeric'){
    if(attrOf(attrs,'tupleRef')!==undefined)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
    open.push({kind:f.local==='nonFraction'?'nf':'nn',attrs,ns:f.ns,text:'',inner:null});
   }else if(f.local==='exclude')st.exclude++;
   else if(f.local==='fraction'||f.local==='tuple')out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
   return;
  }
  if(f.uri!==NS.xbrli)return;
  if(f.local==='context'){st.ctx={id:attrOf(attrs,'id')??'',scheme:'',ident:'',start:'',end:'',instant:'',forever:false,dimensional:false};return;}
  if(st.ctx!==null){
   if(f.local==='segment'||f.local==='scenario'){st.segDepth=stack.length;return;}
   if(f.local==='identifier'){st.ctx.scheme=attrOf(attrs,'scheme')??'';st.ctxField='ident';return;}
   if(f.local==='startDate'){st.ctxField='start';return;}
   if(f.local==='endDate'){st.ctxField='end';return;}
   if(f.local==='instant'){st.ctxField='instant';return;}
   if(f.local==='forever'){st.ctx.forever=true;return;}
   return;
  }
  if(f.local==='unit'){st.unit={id:attrOf(attrs,'id')??'',measures:[],num:[],den:[]};return;}
  if(st.unit!==null){
   if(f.local==='unitNumerator')st.unitPart='num';
   else if(f.local==='unitDenominator')st.unitPart='den';
   else if(f.local==='measure')st.measure={ns:f.ns,text:''};
  }
 };
 const onClose=(f:Frame)=>{
  if(f.uri===NS.ix){
   if(f.local==='exclude'){st.exclude=Math.max(0,st.exclude-1);return;}
   if(f.local==='nonFraction'||f.local==='nonNumeric'){
    const fr=open.pop();if(!fr)return;
    const text=fr.inner??fr.text;
    const parent=open[open.length-1];
    if(parent){if(parent.kind==='nf')parent.inner=text;else parent.text+=text;}
    rawFacts.push({kind:fr.kind,attrs:fr.attrs,ns:fr.ns,text});
   }
   return;
  }
  if(f.uri!==NS.xbrli)return;
  if(st.ctx!==null){
   if(f.local==='context'){contexts.set(st.ctx.id,st.ctx);st.ctx=null;st.ctxField=null;st.segDepth=-1;return;}
   if((f.local==='segment'||f.local==='scenario')&&st.segDepth===stack.length){st.segDepth=-1;return;}
   if(f.local==='identifier'||f.local==='startDate'||f.local==='endDate'||f.local==='instant')st.ctxField=null;
   return;
  }
  if(st.unit!==null){
   if(f.local==='unit'){units.set(st.unit.id,st.unit);st.unit=null;st.unitPart=null;return;}
   if(f.local==='measure'&&st.measure!==null){
    const r=resolveQName(st.measure.text.trim(),st.measure.ns,true);
    const m=r.uri===NS.iso4217||r.uri===NS.xbrli?r.local:`{${r.uri??''}}${r.local}`;
    (st.unitPart==='num'?st.unit.num:st.unitPart==='den'?st.unit.den:st.unit.measures).push(m);st.measure=null;return;
   }
   if(f.local==='unitNumerator'||f.local==='unitDenominator')st.unitPart=null;
  }
 };

 for(const tok of tokenizeXml(doc)){
  if(tok.t==='text'){
   if(st.ctx!==null&&st.ctxField!==null&&st.segDepth<0)st.ctx[st.ctxField]+=tok.text;
   if(st.measure!==null)st.measure.text+=tok.text;
   if(open.length>0&&st.exclude===0)open[open.length-1].text+=tok.text;
   continue;
  }
  if(tok.t==='open'){
   const parent=stack.length>0?stack[stack.length-1].ns:root;
   let ns:NsMap=parent;
   const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
   if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
   const {uri,local}=resolveQName(tok.name,ns,true);
   const frame:Frame={name:tok.name,ns,uri,local};
   if(tok.self){onOpen(frame,tok.attrs);onClose(frame);}
   else{onOpen(frame,tok.attrs);stack.push(frame);}
   continue;
  }
  const frame=stack.pop();
  if(!frame||frame.name!==tok.name)throw new IxbrlParseError('mismatched_close');
  onClose(frame);
 }
 if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
 if(!st.sawIx)return {facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]};

 for(const f of rawFacts){
  const nameQ=attrOf(f.attrs,'name');
  if(!nameQ){out.unsupported.push({reason:'name'});continue;}
  const q=resolveQName(nameQ.trim(),f.ns,true);const name=canonicalConcept(q.uri,q.local);
  if(f.kind==='nn'){
   if(!DEI_NON_NUMERIC.includes(name))continue;
   const text=f.text.replace(/\s+/g,' ').trim();
   const prev=out.nonNumeric[name];
   if(prev===undefined)out.nonNumeric[name]=text;
   else if(prev!==text)out.unsupported.push({reason:'nonnumeric_conflict',name});
   continue;
  }
  if(attrOf(f.attrs,'tupleRef')!==undefined)continue;   // reported when opened
  const contextRef=attrOf(f.attrs,'contextRef')??'';
  const c=contexts.get(contextRef);
  if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
  if(c.dimensional)continue;
  const period=periodOf(c);
  if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
  const where={name,contextRef,periodStart:period.start,periodEnd:period.end};
  const nil=nsAttr(f.attrs,f.ns,NS.xsi,'nil');
  if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
  const unitRef=attrOf(f.attrs,'unitRef')??'';
  const u=units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
  const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
  const sign=attrOf(f.attrs,'sign');
  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
  const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
  const digits=fmt===null?null:parseFactText(fmt,f.text);
  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
  const scale=Number(scaleRaw);
  let value=canonicalDecimal(`${digits}e${scale}`);
  if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:attrOf(f.attrs,'decimals')??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
 }
 return out;
}
