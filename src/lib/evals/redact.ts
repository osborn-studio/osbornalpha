// src/lib/evals/redact.ts
// --redact (spec §4.5): scans the F6-owned evidence paths — src/lib/evals/fixtures/**, docs/evals/**,
// and docs/audits/2026-11-06-evals-gold-sets/** —
// for credential and personal-data shapes. Not all of docs/audits/**: other modules' audit files quote Codex output
// with e-mail addresses and query tokens (integration check over the sibling branches) and F6 may not edit them. Findings carry path, rule and line — NEVER the matched text, so the CI
// job summary cannot leak what it found. Rules: query-string tokens (?token= &key= ?sig=,
// X-Amz-Signature), postgres:// / postgresql:// URLs, three-segment JWTs starting eyJ, sk_/sb_/ghp_
// secret prefixes, e-mail addresses (RFC 2606 example domains exempt), storage-bucket object paths
// outside private:// (disclosure-raw/…, macro-raw/…, eval-restricted/…, /storage/v1/object/…), and
// — in .json files only — any `text`, `note` or `notes` string longer than 200 characters.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,sep} from 'node:path';

/** Directories (scanned recursively) or single files; integration narrowed docs/audits/** to F6-owned paths. */
export const REDACT_ROOTS:readonly string[]=['src/lib/evals/fixtures','docs/evals','docs/audits/2026-11-06-evals-gold-sets'];
export const LONG_FIELD_LIMIT=200;
export interface RedactFinding{path:string;rule:string;line:number|null;field?:string}
const LONG_FIELDS=new Set(['text','note','notes']);
const EXAMPLE_DOMAIN=/@(?:[A-Za-z0-9-]+\.)*example\.(?:com|org|net|invalid)$/i;
const RULES:readonly {rule:string;re:RegExp;allow?:(m:string)=>boolean}[]=[
 {rule:'query_token',re:/[?&][A-Za-z0-9_.-]*(?:token|key|sig)=/gi},
 {rule:'query_token',re:/X-Amz-Signature/gi},
 {rule:'postgres_url',re:/postgres(?:ql)?:\/\//gi},
 {rule:'jwt',re:/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g},
 {rule:'secret_prefix',re:/(?<![A-Za-z0-9])(?:sk|sb|ghp)_[A-Za-z0-9_-]{8,}/g},
 {rule:'email',re:/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,allow:m=>EXAMPLE_DOMAIN.test(m)},
 {rule:'bucket_path',re:/(?<!private:\/\/)\b(?:disclosure-raw|macro-raw|eval-restricted)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g},
 {rule:'bucket_path',re:/\/storage\/v1\/object\//g},
];
const lineAt=(text:string,index:number)=>{let n=1;for(let i=0;i<index;i++)if(text.charCodeAt(i)===10)n++;return n;};

/** Every credential rule applied to one decoded JSON string value (catches escaped slashes and \\u sequences); line is unknown. */
function decodedFindings(v:unknown,path:string,out:RedactFinding[]):void{
 if(typeof v==='string'){for(const {rule,re,allow} of RULES)for(const m of v.matchAll(re))if(!allow?.(m[0]))out.push({path,rule,line:null});}
 else if(Array.isArray(v))for(const x of v)decodedFindings(x,path,out);
 else if(v!==null&&typeof v==='object')for(const x of Object.values(v))decodedFindings(x,path,out);
}
function longFields(v:unknown,key:string|null,path:string,out:RedactFinding[]):void{
 if(typeof v==='string'){if(key!==null&&LONG_FIELDS.has(key)&&v.length>LONG_FIELD_LIMIT)out.push({path,rule:'long_field',line:null,field:key});}
 else if(Array.isArray(v))for(const x of v)longFields(x,key,path,out);
 else if(v!==null&&typeof v==='object')for(const [k,x] of Object.entries(v))longFields(x,k,path,out);
}

/** Pure scan of in-memory files (repo-relative path + UTF-8 text). Sorted by path, line, rule. */
export function redactScan(files:readonly {path:string;text:string}[]):RedactFinding[]{
 const out:RedactFinding[]=[];
 for(const {path,text} of files){
  for(const {rule,re,allow} of RULES){
   for(const m of text.matchAll(re)){if(!allow?.(m[0]))out.push({path,rule,line:lineAt(text,m.index??0)});}
  }
  if(path.endsWith('.json')){
   let parsed:unknown;
   try{parsed=JSON.parse(text);}catch{out.push({path,rule:'invalid_json',line:null});continue;}
   longFields(parsed,null,path,out);
   const seen=new Set(out.filter(f=>f.path===path).map(f=>f.rule));
   const decoded:RedactFinding[]=[];
   decodedFindings(parsed,path,decoded);
   for(const f of decoded)if(!seen.has(f.rule)){seen.add(f.rule);out.push(f);}
  }
 }
 return out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:(a.line??0)-(b.line??0)||(a.rule<b.rule?-1:a.rule>b.rule?1:0));
}

/** Every file under REDACT_ROOTS (missing roots are skipped), as repo-relative POSIX paths with UTF-8 text. */
export function redactTargets(root:string=process.cwd()):{path:string;text:string}[]{
 const out:{path:string;text:string}[]=[];
 for(const dir of REDACT_ROOTS){
  const abs=join(root,dir);
  let st:ReturnType<typeof statSync>;
  try{st=statSync(abs);}catch{continue;}
  if(st.isFile()){out.push({path:dir,text:readFileSync(abs,'utf8')});continue;}
  if(!st.isDirectory())continue;
  for(const rel of (readdirSync(abs,{recursive:true}) as string[]).sort()){
   const file=join(abs,rel);
   if(!statSync(file).isFile())continue;
   out.push({path:`${dir}/${rel.split(sep).join('/')}`,text:readFileSync(file,'utf8')});
  }
 }
 return out;
}
