// Topic spec §4.1 rules 1–7: all resolver states.
import type {EvidenceKind,EvidenceRef} from '../ref';
import type {MemorySourcesInput} from '../memory-sources';
import {macroFixture,OBS} from './macro';
import {industryFixture,CELL} from './industry';
import {factFixture,FACT} from './facts';
import {documentFixture,DOC} from './documents';
import {judgmentFixture,JUDGMENT} from './judgments';
export function allFixtures():MemorySourcesInput{
 const macro=macroFixture(),industry=industryFixture(),facts=factFixture();
 return {...macro,...industry,...facts,...documentFixture(),...judgmentFixture(),freshness:{...macro.freshness,...industry.freshness,...facts.freshness}};
}
type Sample={ref:EvidenceRef;expect:string;secrets?:string[]};
const sample=(kind:EvidenceKind,id:string,expect:string,secrets?:string[],extra:Partial<EvidenceRef>={}):Sample=>({ref:{v:1,kind,id,as_of:'2026-11-14T00:00:00.000Z',...extra},expect,...(secrets?{secrets}:{})});
const macro=(id:string,state:string,secrets?:string[],extra:Partial<EvidenceRef>={})=>sample('macro_observation',id,state,secrets,extra);
export const SAMPLES:Record<EvidenceKind,Sample[]>={
 macro_observation:[
  macro(OBS.unrateV1,'ok:null'),macro(OBS.unrateV2,'missing:not_found'),
  macro(OBS.unrateV1,'missing:locator_mismatch',undefined,{locator:{series_id:'WRONG',period_end:'2026-08-31'}}),
  macro(OBS.orphan,'missing:catalog_missing'),macro(OBS.quarantined,'retracted:quarantined',['6.7']),
  macro(OBS.unrateV1,'missing:not_yet_available',undefined,{as_of:'2026-09-01T00:00:00.000Z'}),
  macro(OBS.vix,'withheld:catalog_restricted',['18.75']),macro(OBS.thirdParty,'withheld:licence_unconfirmed',['77.25']),
 ],
 industry_metric:[
  [CELL.sicOk,'ok:null'],[CELL.swSuperseded,'ok:null'],[CELL.unknownRun,'missing:not_found'],[CELL.building,'missing:run_not_active'],[CELL.activatedLater,'missing:run_not_active'],
  [CELL.swInternal,'withheld:unlicensed'],[CELL.noRow,'missing:not_found'],[CELL.zeroDenominator,'missing:zero_denominator'],
 ].map(([id,state])=>sample('industry_metric',id,state,id===CELL.swInternal?['0.333']:undefined)),
 financial_fact:[
  [FACT.usOk,'ok:null'],[FACT.unknown,'missing:not_found'],[FACT.hk,'not_served:hk_not_served'],[FACT.quarantined,'retracted:quarantined'],
  [FACT.staged,'missing:not_found'],[FACT.usLater,'missing:not_yet_available'],[FACT.cnPending,'withheld:citation_pending'],[FACT.usIncomplete,'withheld:evidence_incomplete'],
 ].map(([id,state])=>sample('financial_fact',id,state,id===FACT.cnPending?['987654321.12']:id===FACT.quarantined?['5555.55']:id===FACT.usIncomplete?['8888.88']:undefined)),
 document_citation:[
  [DOC.ok,'ok:null'],[DOC.unknown,'missing:not_found'],[DOC.later,'missing:not_yet_available'],[DOC.internal,'withheld:private_document'],[DOC.private,'withheld:private_document'],
 ].map(([id,state])=>sample('document_citation',id,state,state.startsWith('withheld')?['private snippet 87654321']:undefined)),
 judgment:[
  [JUDGMENT.ok,'ok:null'],[JUDGMENT.unknown,'missing:not_found'],[JUDGMENT.later,'missing:not_yet_registered'],[JUDGMENT.private,'withheld:method_not_publishable'],[JUDGMENT.noMethod,'withheld:method_not_publishable'],[JUDGMENT.withdrawn,'retracted:withdrawn'],
 ].map(([id,state])=>sample('judgment',id,state)),
 broker_report_meta:[sample('broker_report_meta','60000000-0000-4000-8000-000000000001','unsupported:foreign_research_not_wired')],
};
