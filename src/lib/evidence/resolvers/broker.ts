// Topic spec §4.1 (X6): public broker identity awaits PR-12.
import {missing,type EvidenceResolver} from '../resolve';
export function brokerResolver():EvidenceResolver<'broker_report_meta'>{
 return {kind:'broker_report_meta',code_version:'evidence-broker/0',
  async resolve(refs){return refs.map(ref=>({...missing(ref,'foreign_research_not_wired'),state:'unsupported' as const}));},
  async latestIdentity(){return null;},
 };
}
