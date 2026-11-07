import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe,expect,it,vi} from 'vitest';
import * as edgar from '@/lib/facts/providers/edgar-companyfacts';
import {parseCompanyFacts} from '@/lib/facts/providers/edgar-companyfacts';
import {snapshotOf} from '@/lib/facts/providers/shared';
import {MAPPING_VERSION} from '@/lib/facts/concepts';
import {edgarPointer} from './evidence-index';
import {replayCompanyEvidence} from './replay-evidence';

const bytes=new Uint8Array(readFileSync(new URL('../facts/fixtures/edgar/CIK0000320193.trimmed.json',import.meta.url)));
const snapshot=snapshotOf(bytes,{source:'edgar'});
const candidate=parseCompanyFacts(snapshot,{sinceYear:1900}).candidates[0] as ReturnType<typeof parseCompanyFacts>['candidates'][number]&{locator:string};
const factId:string='11111111-1111-4111-8111-111111111111';
function response(selected=candidate,sha=snapshot.sha256){
 const filingId:string='22222222-2222-4222-8222-222222222222';
 const runId='33333333-3333-4333-8333-333333333333';
 const series=[{kind:'fact',factId,filingId,sourceConcept:selected.sourceConcept,value:selected.value,rawHash:selected.rawHash,runId,mappingVersion:MAPPING_VERSION,unit:selected.unit}];
 return {market:'US',asOf:'2026-11-07',truncated:false,history:true,concept:selected.concept,periodStart:selected.periodStart??selected.periodEnd,periodEnd:selected.periodEnd,unit:selected.unit,
  series,otherUnitSeries:[] as typeof series,
  filings:{[filingId]:{filingId,sourceRef:selected.filingRef,url:'https://www.sec.gov/Archives/index',citation:'edgar'}},
  evidence:{[factId]:{factId,rawHash:selected.rawHash,snapshot:{source:'edgar',sha256:sha,download:`/api/companies/snapshot?fact=${factId}`},locator:{hashLocator:selected.locator,jsonPointer:edgarPointer(selected.locator)},run:{runId,codeVersion:'recorded-test',toolVersions:{parser:'test'}},mappingVersion:MAPPING_VERSION,sourceDocument:{kind:'edgar_index',url:'https://www.sec.gov/Archives/index'}}}};
}

describe('offline company source replay',()=>{
 it('replays a saved facts-series response against recorded EDGAR bytes without live dependencies',()=>{
  expect(replayCompanyEvidence(response(),factId,bytes)).toEqual({status:'source_replay_verified',factId,value:candidate.value,snapshotSha256:snapshot.sha256,mappingVersion:MAPPING_VERSION});
 });
 it('rejects tampered bytes before trusting their content',()=>{
  expect(replayCompanyEvidence(response(),factId,new Uint8Array([...bytes,32]))).toEqual({status:'rejected',reason:'snapshot_hash_mismatch'});
 });
 it.each(['value','sourceConcept','filing','period','unit','pointer','locator','run'] as const)('rejects a mismatched %s binding',field=>{
  const body=response();
  if(field==='value')body.series[0].value='1';
  if(field==='sourceConcept')body.series[0].sourceConcept='us-gaap.WrongTag';
  if(field==='filing')body.filings[body.series[0].filingId].sourceRef='wrong';
  if(field==='period')body.periodStart='1900-01-01';
  if(field==='unit'){body.unit='EUR';body.series[0].unit='EUR';}
  if(field==='pointer')body.evidence[factId].locator.jsonPointer='/facts/wrong';
  if(field==='locator')body.evidence[factId].locator.hashLocator+='wrong';
  if(field==='run')body.evidence[factId].run.runId='another-run';
  expect(replayCompanyEvidence(body,factId,bytes).status).toBe('rejected');
 });
 it('abstains from unsupported mapping versions and CN snapshots',()=>{
  const body=response();body.series[0].mappingVersion='facts-map/future';
  expect(replayCompanyEvidence(body,factId,bytes)).toEqual({status:'rejected',reason:'mapping_version_unsupported'});
  expect(replayCompanyEvidence({...response(),market:'CN'},factId,bytes)).toEqual({status:'rejected',reason:'source_not_supported'});
 });
 it('never reports verification for missing, withheld, duplicate or truncated facts',()=>{
  const body=response();
  for(const input of [{...body,series:[]},{...body,series:[{...body.series[0],kind:'withheld'}]},{...body,series:[...body.series,...body.series]},{...body,truncated:true}])
   expect(replayCompanyEvidence(input,factId,bytes).status).toBe('rejected');
 });
 it.each([null,[],{}, {market:'US',series:[null]}, {market:'US',series:[{factId}]}])('rejects malformed saved JSON without throwing: %j',body=>{
  expect(replayCompanyEvidence(body,factId,bytes)).toEqual({status:'rejected',reason:'malformed_response'});
 });
});

describe('offline replay boundaries',()=>{
 it('accepts a fact in the API other-unit series using that entry’s unit',()=>{
  const body=response();body.otherUnitSeries=body.series;body.series=[];body.unit='EUR';
  expect(replayCompanyEvidence(body,factId,bytes).status).toBe('source_replay_verified');
 });
 it('requires a primary-series entry to use the requested unit',()=>{
  const body=response();body.unit='EUR';
  expect(replayCompanyEvidence(body,factId,bytes)).toEqual({status:'rejected',reason:'candidate_mismatch'});
 });
 it('requires the selected evidence mapping and filing identity to agree',()=>{
  const body=response();body.evidence[factId].mappingVersion='facts-map/unknown';
  expect(replayCompanyEvidence(body,factId,bytes)).toEqual({status:'rejected',reason:'evidence_incomplete'});
  const wrong=response();wrong.filings[wrong.series[0].filingId].filingId='another-filing';
  expect(replayCompanyEvidence(wrong,factId,bytes)).toEqual({status:'rejected',reason:'evidence_incomplete'});
 });
 it('rejects a malformed evidence object rather than throwing',()=>{
  const body=response();body.evidence[factId]={} as typeof body.evidence[string];
  expect(replayCompanyEvidence(body,factId,bytes)).toEqual({status:'rejected',reason:'evidence_incomplete'});
 });
});


describe('source replay CLI',()=>{
 it('returns machine-readable verification and nonzero rejection without exposing input files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'osstack-company-replay-'));
  const input=join(dir,'facts.json'),source=join(dir,'snapshot.json');
  const run=(args:string[])=>spawnSync(process.execPath,['--import','tsx','scripts/company/replay-evidence.ts',...args],{encoding:'utf8'});
  try{
   writeFileSync(input,JSON.stringify(response()));writeFileSync(source,bytes);
   const ok=run([input,factId,source]);
   expect(ok.status,ok.stderr).toBe(0);
   expect(JSON.parse(ok.stdout)).toMatchObject({status:'source_replay_verified',factId,value:candidate.value});
   writeFileSync(source,new Uint8Array([...bytes,32]));
   const rejected=run([input,factId,source]);
   expect(rejected.status).toBe(1);
   expect(JSON.parse(rejected.stdout)).toEqual({status:'rejected',reason:'snapshot_hash_mismatch'});
   const invalid=run([input,factId,join(dir,'private-secret-file')]);
   expect(invalid.status).toBe(2);expect(invalid.stdout).toBe('');expect(invalid.stderr.trim()).toBe('replay_input_read_failed');
   writeFileSync(input,'private invalid JSON');
   expect(run([input,factId,source]).status).toBe(2);
   expect(run([]).status).toBe(2);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});


describe('replay parser compatibility and exact rejection paths',()=>{
 it.each(['ambiguous','oddDuration'] as const)('replays an activated %s candidate using the real parser',bucket=>{
  const base={start:'2023-01-01',end:bucket==='oddDuration'?'2023-05-15':'2023-12-31',val:100,accn:'0000320193-23-000106',filed:'2024-01-31',form:'10-K',fy:2023,fp:'FY'};
  const entries=bucket==='ambiguous'?[base,{...base,val:200}]:[base];
  const data=new TextEncoder().encode(JSON.stringify({cik:320193,facts:{'us-gaap':{Revenues:{units:{USD:entries}}}}}));
  const snap=snapshotOf(data,{source:'edgar'}),parsed=parseCompanyFacts(snap,{sinceYear:1900});
  const choices=bucket==='ambiguous'?parsed.ambiguous.flatMap(x=>x.candidates):parsed.oddDuration;
  expect(parsed.candidates).toHaveLength(0);expect(choices.length).toBeGreaterThan(0);
  const selected=choices[0] as typeof candidate;
  expect(replayCompanyEvidence(response(selected,snap.sha256),factId,data)).toEqual({status:'source_replay_verified',factId,value:'100',snapshotSha256:snap.sha256,mappingVersion:MAPPING_VERSION});
 });
 it('rejects duplicated full-key/value candidates if a parser change produces them',()=>{
  const parsed=parseCompanyFacts(snapshot,{sinceYear:1900});
  const spy=vi.spyOn(edgar,'parseCompanyFacts').mockReturnValueOnce({...parsed,candidates:[candidate,candidate]});
  try{expect(replayCompanyEvidence(response(),factId,bytes)).toEqual({status:'rejected',reason:'candidate_mismatch'});}
  finally{spy.mockRestore();}
 });
 it('checks rawHash and evidence fact identity explicitly',()=>{
  const wrongHash=response();wrongHash.series[0].rawHash='f'.repeat(64);
  expect(replayCompanyEvidence(wrongHash,factId,bytes)).toEqual({status:'rejected',reason:'evidence_incomplete'});
  const wrongFact=response();wrongFact.evidence[factId].factId='another-fact';
  expect(replayCompanyEvidence(wrongFact,factId,bytes)).toEqual({status:'rejected',reason:'evidence_incomplete'});
 });
 it('uses landed canonical decimal equality rather than JavaScript number rounding',()=>{
  const body=response();body.series[0].value=candidate.value.includes('.')?candidate.value+'0':candidate.value+'.000';
  expect(replayCompanyEvidence(body,factId,bytes)).toMatchObject({status:'source_replay_verified',value:candidate.value});
 });
});
