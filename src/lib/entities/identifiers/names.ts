// src/lib/entities/identifiers/names.ts
// Company-name normalization for the A+H name match (spec §4.2.2 rule 2). Pure and deliberately
// narrow: two names match only when they are EQUAL after normalization (no fuzzy score). Steps:
// NFKC (full width → half width), lower case, strip trailing H-share markers ("- H SHS", "-H",
// "(H)") and trailing suffix words (Chinese 股份有限公司/有限公司/集团/控股; English
// limited/ltd/co/company/corp/corporation/holdings/group/inc/plc, as whole words) until stable,
// then drop all whitespace, punctuation and symbols.
export const NAMES_VERSION='company-names/1';
const ZH_SUFFIXES=['股份有限公司','有限公司','集团','控股'];
const EN_SUFFIX=/(^|[^\p{L}\p{N}])(limited|ltd|co|company|corp|corporation|holdings|group|inc|plc)$/u;
const H_MARKERS=[/\s*-\s*h\s*shs?\.?$/u,/\s*-\s*h$/u,/\s*\(h\)$/u];
const TRAILING=/[\s\p{P}\p{S}]+$/u;

export function normalizeCompanyName(name:string):string{
 let s=name.normalize('NFKC').toLowerCase().trim();
 for(;;){
  const before=s;
  for(const m of H_MARKERS)s=s.replace(m,'');
  s=s.replace(TRAILING,'');
  for(const z of ZH_SUFFIXES)if(s.endsWith(z))s=s.slice(0,-z.length);
  const en=EN_SUFFIX.exec(s);
  if(en)s=s.slice(0,s.length-en[2].length);
  if(s===before)break;
 }
 return s.replace(/[\s\p{P}\p{S}]/gu,'');
}
