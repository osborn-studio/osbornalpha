// src/lib/evals/validate/audit.ts
// Third-party model audit records (spec §9): parse Codex reports and disposition tables, validate
// docs/audits/<dir>/index.json. Parsing rules (fixed here, tested against the real audit directories):
//  - A FINDINGS TABLE is a markdown table whose header has a column starting with "Severity". The
//    finding id is the `#` column when the header has one; otherwise a severity cell "P1 · R3-1" carries
//    the id; otherwise the id is synthesized as `R<round>-<P1|P2|P3>-<k>` (k = 1-based count of that
//    severity within the table). Bold paragraphs "**R5-1 · P1 — …**" are findings too. Rows whose
//    severity cell has no P1/P2/P3 are ignored; `*` is stripped from every cell; duplicate ids keep the first.
//  - A DISPOSITION TABLE is a table whose header has a column "决定" or "Decision". The id is the first
//    whitespace token of the first cell ("Round-1 #27 …" → "27"); implemented_in is the column named
//    `implemented_in`, else the column right after the decision column.
//  - Decisions: ACCEPT = /\bACCEPT\b/i; OPEN-verify = /OPEN[\s-]*\(?verify\)?/i; OWNER = /\bOWNER\b/i.
//  - Rounds (Codex plan round 1 P1-9): a disposition row's round is explicit when its first cell is "Round-N #id" or its id is
//    "R<N>-…"; otherwise it applies to every round in its file's covers_rounds. A finding (round n, id) is disposed only by a
//    row with that id applying to round n. A row without an explicit round whose id is a finding in two or more of its
//    rounds is ambiguous (audit_disposition_ambiguous) and disposes nothing.
//  - File access goes through deps.readFile (repo-relative path → bytes) when given — the release manifest reads the
//    directory as committed at evidence_commit — else the working tree under root.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {isAbsolute,join,relative} from 'node:path';
import {sha256Hex} from '../canonical-json';
import {GIT_SHA,SHA256,finding,isObject} from './finding';
import type {ValidatorFinding} from './finding';

export type Severity='P1'|'P2'|'P3';
export interface ParsedFinding{id:string;severity:Severity}
export interface DispositionRow{id:string;round:number|null;decision:string;implemented_in:string;file:string}
export interface AuditRound{n:number;target_sha256:string|null;target_git_ref:string;unverified_target?:boolean;prompt_file:string|null;report_file:string;model:string;effort:string;verdict:string;findings:Record<string,number>}
export interface AuditIndex{topic:string;target:{path:string};rounds:AuditRound[];dispositions:{file:string;covers_rounds:number[]}[];open:{owner:string[];verify:string[]};final_verdict:string}
export interface AuditDeps{root?:string;release?:boolean;gitShow?:(ref:string,path:string)=>Uint8Array|null;readFile?:(repoPath:string)=>Uint8Array|null}

const strip=(c:string)=>c.replace(/\*/g,'').trim();
/** Splits one table line into cells; `|` inside backtick spans does not split. */
export function tableCells(line:string):string[]{
 const s=line.trim().replace(/^\|/,'').replace(/\|$/,'');
 const out:string[]=[];let cur='';let code=false;
 for(const ch of s){
  if(ch==='`')code=!code;
  if(ch==='|'&&!code){out.push(cur.trim());cur='';continue;}
  cur+=ch;
 }
 out.push(cur.trim());return out;
}
/** Markdown tables in document order (header + body rows; the separator row is dropped). */
export function markdownTables(md:string):{header:string[];rows:string[][]}[]{
 const out:{header:string[];rows:string[][]}[]=[];let block:string[]=[];
 const flush=()=>{if(block.length>=2&&/^\|\s*:?-{3,}/.test(block[1]))out.push({header:tableCells(block[0]),rows:block.slice(2).map(tableCells)});block=[];};
 for(const line of md.split(/\r?\n/)){if(line.trimStart().startsWith('|'))block.push(line.trim());else flush();}
 flush();return out;
}
const SEV=/\bP([123])\b/;
const SEV_HEADER=/^(severity|p[123]([\s/,]*p[123])*(\b|$))/;
export interface ReportAnalysis{findings:ParsedFinding[];
 /** lines that look like P1/P2 findings but were not captured (fail closed: audit_findings_unparsed) */
 unparsed:string[];
 /** the report states explicitly that there are no P1/P2 findings / no actionable defects */
 explicitNone:boolean}
const NONE=/\bno\s+(?:new\s+)?P1(?:\/P2)?\b|\bno\s+actionable\s+(?:defects|regressions|findings)|\bno\s+findings\b/i;
// a line that starts with a P1/P2 marker (after table pipes, list markers, headings, bold)
const STARTS_P=/^[\s>*_#\-\d.)|]*\**\s*(?:[A-Za-z]+\d*(?:-\w+)*\s*·\s*)?P[12]\b/;
const LIST_P=/^\s*(?:\d+[.)]|[-*•])\s+\**\s*(?:([A-Za-z]+\d+(?:-\w+)*)\s*·\s*)?(P[123])\b/;
const HEAD_P=/^#{2,6}\s+\**\s*(?:([A-Za-z]+\d+(?:-\w+)*)\s*·\s*)?(P[123])\b/;
const BOLD_P=/^\*\*(?:([A-Za-z]+\d+(?:-\w+)*)\s*·\s*)?(P[123])\b/;
/** Findings of a Codex report plus the lines it could not capture; synthesized ids (`R<round>-<P>-<k>`) are unique report-wide. */
export function analyzeReport(md:string,round:number):ReportAnalysis{
 const findings:ParsedFinding[]=[];const seen=new Set<string>();const k:Record<string,number>={};
 const add=(id:string,severity:Severity)=>{if(id&&!seen.has(id)){seen.add(id);findings.push({id,severity});}};
 const synth=(severity:Severity)=>{k[severity]=(k[severity]??0)+1;return `R${round}-${severity}-${k[severity]}`;};
 const lines=md.split(/\r?\n/);const consumed=new Set<number>();
 // tables with line indexes
 let i=0;
 while(i<lines.length){
  if(!lines[i].trimStart().startsWith('|')){i++;continue;}
  const start=i;while(i<lines.length&&lines[i].trimStart().startsWith('|'))i++;
  const block=lines.slice(start,i);
  if(block.length<2||!/^\|\s*:?-{3,}/.test(block[1].trim()))continue;
  const h=tableCells(block[0]).map(x=>strip(x).toLowerCase());
  const sev=h.findIndex(x=>SEV_HEADER.test(x));
  if(sev<0)continue;
  const idCol=h.indexOf('#');
  consumed.add(start);consumed.add(start+1);
  for(let r=2;r<block.length;r++){
   const row=tableCells(block[r]);const cell=strip(row[sev]??'');const m=SEV.exec(cell);
   if(!m){consumed.add(start+r);continue;}
   const severity=`P${m[1]}` as Severity;
   if(idCol>=0){const id=strip(row[idCol]??'');if(!id)continue;add(id,severity);consumed.add(start+r);continue;}
   const inline=/^P[123]\s*·\s*(\S+)$/.exec(cell);
   consumed.add(start+r);
   if(inline){add(inline[1],severity);continue;}
   add(synth(severity),severity);
  }
 }
 lines.forEach((line,n)=>{
  if(consumed.has(n))return;
  const t=line.trim();
  const m=LIST_P.exec(t)??HEAD_P.exec(t)??BOLD_P.exec(t);
  if(m){add(m[1]??synth(m[2] as Severity),m[2] as Severity);consumed.add(n);}
 });
 const unparsed:string[]=[];
 lines.forEach((line,n)=>{
  if(consumed.has(n))return;
  const t=line.trim();
  const cellP=t.startsWith('|')&&tableCells(t).some(c=>/^P[12]$/.test(strip(c)));
  if(STARTS_P.test(t)||cellP)unparsed.push(`line ${n+1}: ${t.slice(0,60)}`);
 });
 return {findings,unparsed,explicitNone:NONE.test(md)};
}
export const parseFindings=(md:string,round:number):ParsedFinding[]=>analyzeReport(md,round).findings;
export function parseDispositions(md:string,file:string):DispositionRow[]{
 const out:DispositionRow[]=[];
 for(const t of markdownTables(md)){
  const h=t.header.map(x=>strip(x).toLowerCase());
  const d=h.findIndex(x=>x==='决定'||x==='decision');
  if(d<0)continue;
  const named=h.indexOf('implemented_in');const impl=named>=0?named:d+1;
  for(const r of t.rows){
   const first=strip(r[0]??'');if(!first)continue;
   const q=/^Round-(\d+)\s*#(\S+)/i.exec(first);
   const id=q?.[2]??first.split(/\s+/)[0];
   const named=/^R(\d+)-/.exec(id);
   const round=q?Number(q[1]):named?Number(named[1]):null;
   out.push({id,round,decision:strip(r[d]??''),implemented_in:strip(r[impl]??''),file});
  }
 }
 return out;
}
export type DecisionKind='accept'|'decline'|'partial'|'owner'|'open_verify'|'resolved'|'implemented'|'unknown';
/** Supported disposition states, derived from the real disposition files (ACCEPT [+ …], DECLINE, PARTIAL, OWNER, OPEN-verify, RESOLVED, implemented per Codex's fix). Blank / anything else = unknown. */
export function decisionKind(d:string):DecisionKind{
 const t=d.trim();
 if(!t)return 'unknown';
 if(/^\**\s*ACCEPT\b/i.test(t))return 'accept';
 if(/^\**\s*DECLINE/i.test(t))return 'decline';
 if(/^\**\s*PARTIAL/i.test(t))return 'partial';
 if(/^\**\s*OPEN[\s-]*\(?verify\)?/i.test(t))return 'open_verify';
 if(/^\**\s*OWNER\b/i.test(t))return 'owner';
 if(/^\**\s*RESOLVED\b/i.test(t))return 'resolved';
 if(/^implemented per Codex/i.test(t))return 'implemented';
 return 'unknown';
}
export const isAccept=(d:string)=>/\bACCEPT\b/i.test(d);
export const isOpenVerify=(d:string)=>/OPEN[\s-]*\(?verify\)?/i.test(d);
export const isOwner=(d:string)=>/\bOWNER\b/i.test(d);
/** First line `**Verdict: X**` → X (trailing period dropped); null when absent. */
export function parseVerdict(md:string):string|null{
 const first=md.split(/\r?\n/).find(l=>l.trim()!=='')??'';
 const m=/^\*\*Verdict:\s*(.+?)\*\*/.exec(first.trim());
 return m?m[1].trim().replace(/\.$/,''):null;
}
export function severityCounts(f:ParsedFinding[]):{p1:number;p2:number;p3:number}{
 return {p1:f.filter(x=>x.severity==='P1').length,p2:f.filter(x=>x.severity==='P2').length,p3:f.filter(x=>x.severity==='P3').length};
}
// GIT_* variables (exported by git hooks) would redirect the lookup away from `root`'s repository.
const gitEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const defaultGitShow=(root:string)=>(ref:string,path:string):Uint8Array|null=>{
 try{return execFileSync('git',['show',`${ref}:${path}`],{cwd:root,env:gitEnv(),stdio:['ignore','pipe','ignore'],maxBuffer:64*1024*1024});}catch{return null;}
};
const strArr=(v:unknown)=>Array.isArray(v)&&v.every(x=>typeof x==='string');
function indexShape(v:unknown):string|null{
 if(!isObject(v))return 'index.json is not an object';
 if(typeof v.topic!=='string'||!v.topic)return 'topic';
 if(!isObject(v.target)||typeof v.target.path!=='string'||!v.target.path)return 'target.path';
 if(!Array.isArray(v.rounds)||v.rounds.length===0)return 'rounds';
 for(const r of v.rounds){
  if(!isObject(r))return 'rounds[]';
  if(!Number.isInteger(r.n)||typeof r.target_git_ref!=='string'||typeof r.report_file!=='string'||!(r.prompt_file===null||typeof r.prompt_file==='string')
   ||typeof r.model!=='string'||typeof r.effort!=='string'||typeof r.verdict!=='string'||!r.verdict||!(r.target_sha256===null||typeof r.target_sha256==='string')||!isObject(r.findings))return `rounds[n=${String(r.n)}]`;
 }
 if(!Array.isArray(v.dispositions)||v.dispositions.some(d=>!isObject(d)||typeof d.file!=='string'||!Array.isArray(d.covers_rounds)||!d.covers_rounds.every(Number.isInteger)))return 'dispositions';
 if(!isObject(v.open)||!strArr(v.open.owner)||!strArr(v.open.verify))return 'open';
 if(typeof v.final_verdict!=='string')return 'final_verdict';
 return null;
}

/** audit_findings_unparsed: P1/P2 lines nobody captured, or zero findings without an explicit statement (fail closed). */
export function unparsedFindings(a:ReportAnalysis,where:string):ValidatorFinding[]{
 const out:ValidatorFinding[]=[];
 if(a.unparsed.length>0)out.push(finding('audit_findings_unparsed',where,`P1/P2 text not recognised as a finding (${a.unparsed.slice(0,3).join('; ')})`));
 else if(a.findings.length===0&&!a.explicitNone)out.push(finding('audit_findings_unparsed',where,'no findings were parsed and the report does not state "No P1/P2" / "no actionable defects"'));
 return out;
}

/** Validates one audit directory (spec §9). `release` adds the release-manifest rules (§10 model_audit). */
export function validateAuditDir(dir:string,deps:AuditDeps={}):ValidatorFinding[]{
 const root=deps.root??process.cwd();
 const abs=isAbsolute(dir)?dir:join(root,dir);
 const rel=(f:string)=>relative(root,join(abs,f));
 /** UTF-8 text of a file of this directory, or null when absent. */
 const read=(f:string):string|null=>{
  if(deps.readFile){const b=deps.readFile(rel(f).split('\\').join('/'));return b?new TextDecoder().decode(b):null;}
  return existsSync(join(abs,f))?readFileSync(join(abs,f),'utf8'):null;
 };
 const out:ValidatorFinding[]=[];
 const indexText=read('index.json');
 if(indexText===null)return [finding('audit_index_missing',rel('index.json'),'index.json not found')];
 let raw:unknown;
 try{raw=JSON.parse(indexText);}catch{return [finding('audit_index_invalid',rel('index.json'),'index.json is not valid JSON')];}
 const bad=indexShape(raw);
 if(bad)return [finding('audit_index_invalid',rel('index.json'),`invalid field: ${bad}`)];
 const index=raw as AuditIndex;
 const gitShow=deps.gitShow??defaultGitShow(root);
 const byRound=new Map<number,ParsedFinding[]>();
 index.rounds.forEach((r,i)=>{
  const where=`${rel('index.json')}#rounds[n=${r.n}]`;
  if(r.n!==i+1)out.push(finding('audit_round_order',where,`round ${r.n} at position ${i+1}`));
  if(r.prompt_file!==null&&read(r.prompt_file)===null)out.push(finding('audit_file_missing',rel(r.prompt_file),'prompt file not found'));
  const reportText=read(r.report_file);
  if(reportText===null){out.push(finding('audit_file_missing',rel(r.report_file),'report file not found'));byRound.set(r.n,[]);return;}
  const analysis=analyzeReport(reportText,r.n);
  const parsed=analysis.findings;
  byRound.set(r.n,parsed);
  out.push(...unparsedFindings(analysis,`${rel(r.report_file)}`));
  const c=severityCounts(parsed);
  for(const k of ['p1','p2','p3'] as const)if((r.findings[k]??0)!==c[k])out.push(finding('audit_findings_count',where,`findings.${k}=${r.findings[k]??0} but the report has ${c[k]}`));
  if(r.target_git_ref==='uncommitted'){
   if(r.unverified_target!==true)out.push(finding('audit_unverified_target',where,"target_git_ref 'uncommitted' requires unverified_target: true"));
  }else if(!GIT_SHA.test(r.target_git_ref)||r.target_sha256===null||!SHA256.test(r.target_sha256)){
   out.push(finding('audit_target_ref',where,'committed rounds need a 40-hex target_git_ref and a 64-hex target_sha256'));
  }else{
   const bytes=gitShow(r.target_git_ref,index.target.path);
   if(bytes===null)out.push(finding('audit_target_unreadable',where,`git show ${r.target_git_ref}:${index.target.path} failed`));
   else if(sha256Hex(bytes)!==r.target_sha256)out.push(finding('audit_target_mismatch',where,'target_sha256 differs from the committed bytes'));
  }
 });
 const rows:DispositionRow[]=[];
 const covers=new Map<string,number[]>();
 for(const d of index.dispositions){
  const text=read(d.file);
  if(text===null){out.push(finding('audit_file_missing',rel(d.file),'disposition file not found'));continue;}
  covers.set(d.file,d.covers_rounds);
  rows.push(...parseDispositions(text,d.file));
 }
 // P1-9: a row applies to its explicit round, else to its file's covers_rounds; ambiguous reuse disposes nothing.
 const roundsOf=(r:DispositionRow)=>r.round!==null?[r.round]:covers.get(r.file)??[];
 const ambiguous=new Set<DispositionRow>();
 for(const r of rows){
  if(r.round!==null)continue;
  const hit=roundsOf(r).filter(n=>(byRound.get(n)??[]).some(f=>f.id===r.id));
  if(hit.length>1){ambiguous.add(r);out.push(finding('audit_disposition_ambiguous',`${rel(r.file)} #${r.id}`,`row without a round qualifier matches findings of rounds ${hit.join(',')}; write "Round-N #${r.id}"`));}
 }
 for(const r of rows)if(decisionKind(r.decision)==='unknown')out.push(finding('audit_decision_unknown',`${rel(r.file)} #${r.id}`,`decision "${r.decision.slice(0,40)}" is not a supported state (ACCEPT, DECLINE, PARTIAL, OWNER, OPEN-verify, RESOLVED); the row disposes nothing`));
 const rowsFor=(n:number,id:string)=>rows.filter(r=>r.id===id&&!ambiguous.has(r)&&decisionKind(r.decision)!=='unknown'&&roundsOf(r).includes(n));
 for(const [n,list] of byRound)for(const f of list)if(rowsFor(n,f.id).length===0)out.push(finding('audit_finding_undisposed',`round ${n} #${f.id}`,'no disposition row for this round and id'));
 for(const r of rows)if(isAccept(r.decision)&&!r.implemented_in)out.push(finding('audit_accept_unimplemented',`${rel(r.file)} #${r.id}`,'ACCEPT row without implemented_in'));
 if(rows.some(r=>isOpenVerify(r.decision))&&index.open.verify.length===0)out.push(finding('audit_open_inconsistent',rel('index.json'),'OPEN-verify dispositions exist but open.verify is empty'));
 if(rows.some(r=>isOwner(r.decision))&&index.open.owner.length===0)out.push(finding('audit_open_inconsistent',rel('index.json'),'OWNER dispositions exist but open.owner is empty'));
 if(deps.release){
  const last=index.rounds[index.rounds.length-1];
  if(last.target_git_ref==='uncommitted')out.push(finding('audit_release_uncommitted',`${rel('index.json')}#rounds[n=${last.n}]`,'the last round must target a commit'));
  for(const [n,list] of byRound)for(const f of list){
   if(f.severity==='P3')continue;
   const mine=rowsFor(n,f.id);
   if(mine.some(r=>isOpenVerify(r.decision)))out.push(finding('audit_release_open_verify',`round ${n} #${f.id}`,`${f.severity} finding is OPEN-verify`));
   if(mine.some(r=>isAccept(r.decision)&&!r.implemented_in))out.push(finding('audit_release_unimplemented',`round ${n} #${f.id}`,`${f.severity} ACCEPT without implemented_in`));
  }
 }
 return out;
}
