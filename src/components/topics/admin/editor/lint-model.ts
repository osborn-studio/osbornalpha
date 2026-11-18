// Topic plan T5.5: client-safe grouping and exact public-value fixes.
import type {LintFinding} from '@/lib/topics/drafts';
export interface FieldFinding{code:'numeral_in_owner_text'|'forbidden_term'|'advice_term'|'dangling_slot';match:string;fix?:{ordinal:number}}
type Evidence={ordinal:number;state:string;text:string|null};
export function attachFixes(findings:{code:FieldFinding['code'];match:string}[],evidence:Evidence[]):FieldFinding[]{
 // The inherited validator emits single characters as well as complete quantities.
 // Present the complete fragment once, preserving diagnostic order.
 const complete=findings.filter(f=>f.code!=='numeral_in_owner_text'||!findings.some(g=>g.code===f.code&&g.match!==f.match&&g.match.includes(f.match)));
 return complete.map(f=>{
  const matches=f.code==='numeral_in_owner_text'?evidence.filter(e=>e.state==='ok'&&e.text===f.match):[];
  return {...f,...(matches.length===1?{fix:{ordinal:matches[0].ordinal}}:{})};
 });
}
export function findingsByField(lint:LintFinding[],evidence:Evidence[]):Record<string,FieldFinding[]>{
 const groups:Record<string,FieldFinding[]>={};
 for(const {field,code,match} of lint)(groups[field]??=[]).push({code,match});
 return Object.fromEntries(Object.entries(groups).map(([field,findings])=>[field,attachFixes(findings,evidence)]));
}
