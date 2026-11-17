// src/app/(app)/admin/broker-research/licences/licence-form.ts
// Licence form state ⇄ LicenceInput (spec §4.1; D2/D3 defaults: N ≤ 500, every public flag false).
import type {LicenceInput,LicenceKind,LicenceRow} from '@/lib/broker-research/public-types';

export const LICENCE_KINDS:LicenceKind[]=['terminal_subscription','direct_from_broker','owner_authored','other'];
export const FLAGS=['allows_llm_processing','allows_public_metadata','allows_public_snippets','allows_public_summary','allows_public_target_price'] as const;
export type LicenceForm={source_label:string;licence_kind:LicenceKind;holder:string;terms_summary:string;evidence_path:string;snippet_max_chars:string;valid_from:string;valid_to:string}&Record<typeof FLAGS[number],boolean>;
export const emptyLicenceForm=(today:string):LicenceForm=>({source_label:'',licence_kind:'other',holder:'',terms_summary:'',evidence_path:'',snippet_max_chars:'1',valid_from:today,valid_to:'',
 allows_llm_processing:false,allows_public_metadata:false,allows_public_snippets:false,allows_public_summary:false,allows_public_target_price:false});
export const formFromLicence=(l:LicenceRow):LicenceForm=>({source_label:l.source_label,licence_kind:l.licence_kind,holder:l.holder,terms_summary:l.terms_summary,evidence_path:l.evidence_path??'',
 snippet_max_chars:String(l.snippet_max_chars),valid_from:l.valid_from,valid_to:l.valid_to??'',...Object.fromEntries(FLAGS.map(f=>[f,l[f]])) as Record<typeof FLAGS[number],boolean>});
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const validDate=(v:string)=>DATE.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
export function validateLicenceForm(f:LicenceForm):string[]{
 const bad:string[]=[];
 const label=f.source_label.trim();if(label.length<1||label.length>120)bad.push('source_label');
 if(!f.holder.trim())bad.push('holder');if(!f.terms_summary.trim())bad.push('terms_summary');
 if(!/^\d{1,3}$/.test(f.snippet_max_chars)||(Number(f.snippet_max_chars)<1||Number(f.snippet_max_chars)>500))bad.push('snippet_max_chars');
 if(f.evidence_path.trim()&&!/^licences\/[0-9a-f]{64}\.pdf$/.test(f.evidence_path.trim()))bad.push('evidence_path');
 if(!validDate(f.valid_from))bad.push('valid_from');
 if(f.valid_to&&(!validDate(f.valid_to)||f.valid_to<f.valid_from))bad.push('valid_to');
 return bad;
}
export const toLicenceInput=(f:LicenceForm):LicenceInput=>({source_label:f.source_label.trim(),licence_kind:f.licence_kind,holder:f.holder.trim(),terms_summary:f.terms_summary.trim(),evidence_path:f.evidence_path.trim()||null,
 snippet_max_chars:Number(f.snippet_max_chars),valid_from:f.valid_from,valid_to:f.valid_to||null,...Object.fromEntries(FLAGS.map(k=>[k,f[k]])) as Record<typeof FLAGS[number],boolean>});
