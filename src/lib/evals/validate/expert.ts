// src/lib/evals/validate/expert.ts
// Expert sampling record validator (spec §8). Selection `seeded_sha256`: every non-retracted case of the
// population set gets h = sha256Hex(seed + case_id) (UTF-8 concatenation, no separator); cases group by
// company key = subject.cik ?? subject.ticker; companies rank by their smallest h (ties: key ascending);
// the first `companies` companies are taken, and within each the `cases_per_company` smallest h.
// selected_case_ids is compared as a set (order-insensitive, duplicates rejected).
import {sha256Hex} from '../canonical-json';
import type {GoldCase,GoldLock,GoldSet} from '../types';
import {ISO_DATE,ISO_TS,SHA256,UUID,finding,isObject} from './finding';
import type {ValidatorFinding} from './finding';

export type ExpertVerdict='agree'|'disagree'|'cannot_verify';
export interface ExpertRecord{
 schema_version:1;module:string;sampled_at:string;
 expert:{alias:string;background:string;independence:string;contact_held_by:'owner'};
 population:{set_id:string;set_version:number;set_sha256:string;case_count:number;evaluated_run_id:string;db_state_rev:string};
 selection:{method:'seeded_sha256';seed:string;companies:number;cases_per_company:number;selected_case_ids:string[]};
 checks:{case_id:string;our_value:string|null;document_value:string|null;document:Record<string,unknown>;verdict:ExpertVerdict;note:string}[];
 basis_review:{topic:string;verdict:'agree'|'disagree';note:string}[];
 summary:{agree:number;disagree:number;cannot_verify:number};
 follow_ups:{ref:string;action:string;owner:string;due:string;closed_at:string|null;closure_ref:string|null}[];
}
/** A follow-up closes against a quarantine item, a PR, or a gold-set history version. */
export const CLOSURE_REF=/^(dq_quarantine:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+|gold:[^@\s]+@\d+)$/;

export const companyKeyOf=(c:Pick<GoldCase,'subject'>):string|null=>c.subject.cik??c.subject.ticker??null;
export function seededSelection(cases:Pick<GoldCase,'case_id'|'subject'|'retracted'>[],seed:string,companies:number,perCompany:number):string[]{
 const groups=new Map<string,{case_id:string;h:string}[]>();
 for(const c of cases){
  if(c.retracted)continue;
  const key=companyKeyOf(c);if(key===null)continue;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key)!.push({case_id:c.case_id,h:sha256Hex(seed+c.case_id)});
 }
 const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const ranked=[...groups].map(([key,list])=>({key,list:[...list].sort((a,b)=>cmp(a.h,b.h)||cmp(a.case_id,b.case_id))}))
  .sort((a,b)=>cmp(a.list[0].h,b.list[0].h)||cmp(a.key,b.key));
 return ranked.slice(0,companies).flatMap(g=>g.list.slice(0,perCompany).map(x=>x.case_id));
}
/** The lock entry whose sha256 equals `sha256`, loaded; null when none. */
export function findSetBySha(lock:GoldLock,sha256:string,loadSet:(path:string)=>GoldSet):GoldSet|null{
 const entry=lock.files.find(f=>f.sha256===sha256);
 return entry?loadSet(entry.path):null;
}

const posInt=(v:unknown)=>Number.isInteger(v)&&(v as number)>0;
const nonNegInt=(v:unknown)=>Number.isInteger(v)&&(v as number)>=0;
const str=(v:unknown)=>typeof v==='string'&&v.length>0;
const strOrNull=(v:unknown)=>v===null||typeof v==='string';
function shape(r:unknown):string|null{
 if(!isObject(r))return 'record';
 if(r.schema_version!==1)return 'schema_version';
 if(!str(r.module))return 'module';
 if(typeof r.sampled_at!=='string'||!(ISO_TS.test(r.sampled_at)||ISO_DATE.test(r.sampled_at)))return 'sampled_at';
 const e=r.expert;if(!isObject(e)||!str(e.alias)||typeof e.background!=='string'||typeof e.independence!=='string'||e.contact_held_by!=='owner')return 'expert';
 const p=r.population;
 if(!isObject(p)||!str(p.set_id)||!posInt(p.set_version)||typeof p.set_sha256!=='string'||!SHA256.test(p.set_sha256)||!nonNegInt(p.case_count)
  ||typeof p.evaluated_run_id!=='string'||!UUID.test(p.evaluated_run_id)||typeof p.db_state_rev!=='string')return 'population';
 const s=r.selection;
 if(!isObject(s)||s.method!=='seeded_sha256'||!str(s.seed)||!posInt(s.companies)||!posInt(s.cases_per_company)||!Array.isArray(s.selected_case_ids)||!s.selected_case_ids.every(str))return 'selection';
 if(!Array.isArray(r.checks)||!r.checks.every(c=>isObject(c)&&str(c.case_id)&&strOrNull(c.our_value)&&strOrNull(c.document_value)&&isObject(c.document)&&['agree','disagree','cannot_verify'].includes(c.verdict as string)&&typeof c.note==='string'))return 'checks';
 if(!Array.isArray(r.basis_review)||!r.basis_review.every(b=>isObject(b)&&str(b.topic)&&['agree','disagree'].includes(b.verdict as string)&&typeof b.note==='string'))return 'basis_review';
 const m=r.summary;if(!isObject(m)||!nonNegInt(m.agree)||!nonNegInt(m.disagree)||!nonNegInt(m.cannot_verify))return 'summary';
 if(!Array.isArray(r.follow_ups)||!r.follow_ups.every(f=>isObject(f)&&str(f.ref)&&typeof f.action==='string'&&typeof f.owner==='string'&&typeof f.due==='string'&&strOrNull(f.closed_at)&&strOrNull(f.closure_ref)))return 'follow_ups';
 return null;
}

/** `set` is the population gold set (null = not resolvable). `release` adds the manifest rule: every follow-up closed with a closure_ref. */
export function validateExpertRecord(raw:unknown,set:GoldSet|null,opts:{release?:boolean;where?:string}={}):ValidatorFinding[]{
 const where=opts.where??'expert_sampling';
 const bad=shape(raw);
 if(bad)return [finding('expert_invalid',`${where}#${bad}`,`invalid or missing field: ${bad}`)];
 const r=raw as ExpertRecord;const out:ValidatorFinding[]=[];
 if(!set)return [finding('expert_set_unresolved',`${where}#population.set_sha256`,'no locked gold set has this sha256')];
 if(r.population.set_id!==set.set_id||r.population.set_version!==set.version||r.population.set_sha256!==set.sha256||r.module!==set.module)
  out.push(finding('expert_population',`${where}#population`,'set_id/set_version/set_sha256/module differ from the population set'));
 const eligible=set.cases.filter(c=>!c.retracted);
 if(r.population.case_count!==eligible.length)out.push(finding('expert_population',`${where}#population.case_count`,`case_count ${r.population.case_count} but the set has ${eligible.length} non-retracted cases`));
 for(const c of eligible)if(companyKeyOf(c)===null)out.push(finding('expert_company_key_missing',`${where}#${c.case_id}`,'case subject has neither cik nor ticker'));
 const selected=r.selection.selected_case_ids;
 const expected=seededSelection(set.cases,r.selection.seed,r.selection.companies,r.selection.cases_per_company);
 if(new Set(selected).size!==selected.length)out.push(finding('expert_selection_mismatch',`${where}#selection.selected_case_ids`,'duplicate case ids'));
 const want=new Set(expected);const got=new Set(selected);
 if(want.size!==got.size||[...want].some(id=>!got.has(id)))out.push(finding('expert_selection_mismatch',`${where}#selection.selected_case_ids`,`recomputed selection differs (expected ${expected.length} cases)`));
 const checked=r.checks.map(c=>c.case_id);const checkedSet=new Set(checked);
 if(checkedSet.size!==checked.length)out.push(finding('expert_check_duplicate',`${where}#checks`,'a case is checked twice'));
 for(const id of got)if(!checkedSet.has(id))out.push(finding('expert_check_missing',`${where}#checks`,`selected case ${id} has no check`));
 for(const id of checkedSet)if(!got.has(id))out.push(finding('expert_check_extra',`${where}#checks`,`case ${id} was not selected`));
 const count=(v:ExpertVerdict)=>r.checks.filter(c=>c.verdict===v).length;
 const sum={agree:count('agree'),disagree:count('disagree'),cannot_verify:count('cannot_verify')};
 if(sum.agree!==r.summary.agree||sum.disagree!==r.summary.disagree||sum.cannot_verify!==r.summary.cannot_verify)
  out.push(finding('expert_summary_mismatch',`${where}#summary`,`recomputed ${JSON.stringify(sum)}`));
 if(5*(sum.agree+sum.disagree)<4*selected.length)out.push(finding('expert_coverage',`${where}#checks`,`agree+disagree=${sum.agree+sum.disagree} < 0.8 × ${selected.length}`));
 const refs=new Set(r.follow_ups.map(f=>f.ref));
 for(const c of r.checks)if(c.verdict==='disagree'&&!refs.has(c.case_id))out.push(finding('expert_follow_up_missing',`${where}#checks.${c.case_id}`,'disagree without a follow-up'));
 for(const b of r.basis_review)if(b.verdict==='disagree'&&!refs.has(b.topic))out.push(finding('expert_follow_up_missing',`${where}#basis_review.${b.topic}`,'disagree without a follow-up'));
 if(opts.release)for(const f of r.follow_ups)
  if(f.closed_at===null||(!ISO_TS.test(f.closed_at)&&!ISO_DATE.test(f.closed_at))||f.closure_ref===null||!CLOSURE_REF.test(f.closure_ref))
   out.push(finding('expert_follow_up_open',`${where}#follow_ups.${f.ref}`,'release requires closed_at and a closure_ref (dq_quarantine:<uuid> | PR URL | gold:<set_id>@<version>)'));
 return out;
}
