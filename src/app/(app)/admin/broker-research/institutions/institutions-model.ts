import type {InstitutionDetail} from './InstitutionsClient';
/** The existing admin read exposes scales and analysts, but no report/licence aggregates. */
export function institutionSummary(d:InstitutionDetail,on:string){
 const active=d.scales.filter(s=>s.valid_from<=on&&(s.valid_to===null||s.valid_to>=on));
 return {mapped:new Set(active.map(s=>s.raw_label.trim().toLowerCase())).size,analysts:d.analysts.length,reports:null,licence:null};
}
