// src/lib/macro/strategy/explain-request.ts
// POST /api/macro/strategy/explanations orchestration (spec 2026-11-07 §6.3 steps 1–8, §9.1 order). The route does the
// session (401) and MACRO_STRATEGY_ENABLED (404) checks and passes the user id; everything after is here, with injected
// deps so tests run offline: body ajv → payload_hash → idempotent replay (BEFORE the code version, foundation and subject
// checks) → code version (null → 503) → foundation (port null → 503) → subject + fact manifest (the exact fact list is
// frozen in body.facts) → resolve → (non-BYO) quota → claim (only 'claimed' may bill or call) → begin → call →
// recordCompletion (raw output + the exact finalize payload, durable before validation) → validate → finish → finalize →
// markFinalized. finalize runs in a finally path even when validation or finish throws; markFinalized only after finalize
// succeeded. A begin failure is ambiguous (the usage run may exist): it records a failed payload under the same audit key
// and tries finalize(failed) too. Validation rejection is a completed call (billed as completed). A finalize failure
// never changes the user response; the run row keeps finalize_payload with finalized=false for the ops retry.
// Review subjects are immutable result ids (never the moving pointer). Completion recovery (plan audit R2-1 / R2-2): the
// recorded raw output is a completion envelope {content, provider, model, prompt_version, validator_version, accounting};
// recoverExplanation rebuilds validation / rendering from it and the manifest's frozen facts and finishes the run without
// ever calling the provider (validator version changed → failed {validator_version_changed}), then settles a recorded,
// unsettled finalize payload verbatim. finish also carries the payload so a failed recordCompletion still leaves it stored.
import {readFileSync} from 'node:fs';
import Ajv from 'ajv';
import {canonicalJson,sha256Hex} from './hash';
import type {ExplanationProjection,StrategyManifest} from './contract';
import {VERSIONS} from './contract';
import {StrategyDbError,hasRecordedCompletion,type RunDetail,type StrategyDb} from './db';
import {renderExplanation,renderFacts} from './explain-render';
import {parseModelContent,validateExplanation,VALIDATOR_VERSION} from './explain-validate';
import {buildSnapshotFactsManifest,explanationFacts,reviewFactsManifest} from './facts';
import type {StrategyReadPort} from './port';

// TOPICS ↓
import {runValidatedExplanation,settleUsage,type LlmDeps,type ValidatedRunStore} from './validated-run';
import type {ModelOutput} from './explain-validate';
export {LlmCallError,costErrorCode,costErrorStatus,type LlmDeps} from './validated-run';
// TOPICS ↑
/** codeVersion null = not configured: 503 code_version_unavailable, checked only after the idempotent replay. */
export interface ExplainDeps{db:StrategyDb;port:StrategyReadPort|null;llm:LlmDeps;now:()=>Date;codeVersion:string|null}
export interface ExplainBody{request_id:string;subject:{kind:'snapshot'|'review';id:string};locale:'zh'|'en'}
export type ExplainResponse={status:number;body:ExplanationProjection|{error:{code:string;message:string};explanation?:ExplanationProjection}};

export const PROMPT_VERSION=VERSIONS.prompt;
/** Placeholder manifest id for replay claims: the run row already exists, so the claim RPC never inserts it. */
export const REPLAY_MANIFEST_ID='00000000-0000-0000-0000-000000000000';
const UUID='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const validateBody=new Ajv({strict:true}).compile({type:'object',additionalProperties:false,required:['request_id','subject','locale'],properties:{
 request_id:{type:'string',pattern:UUID},locale:{type:'string',enum:['zh','en']},
 subject:{type:'object',additionalProperties:false,required:['kind','id'],properties:{kind:{type:'string',enum:['snapshot','review']},id:{type:'string',minLength:1,maxLength:200}}}}});
const err=(status:number,code:string,explanation?:ExplanationProjection):ExplainResponse=>({status,body:{error:{code,message:code},...(explanation?{explanation}:{})}});
/** Recorded completions finished per GET /explanations (bounded work on a read). */
export const RECOVER_PER_READ=3;
type FinishArgs=Parameters<StrategyDb['finishExplanation']>[0];
type RecoveryDeps=Pick<ExplainDeps,'db'|'llm'>;
interface Completion{content:string;provider:string|null;model:string|null;prompt_version:string;validator_version:string;accounting:unknown}
function completionOf(raw:unknown):Completion|null{
 if(!hasRecordedCompletion(raw))return null;
 const c=raw as Record<string,unknown>;
 if(typeof c.content!=='string'||typeof c.prompt_version!=='string'||typeof c.validator_version!=='string')return null;
 return {content:c.content,provider:typeof c.provider==='string'?c.provider:null,model:typeof c.model==='string'?c.model:null,prompt_version:c.prompt_version,validator_version:c.validator_version,accounting:c.accounting??null};
}
/** finish arguments rebuilt from the recorded completion and the frozen fact manifest alone (no provider call). */
async function recoveredFinish(db:StrategyDb,run:RunDetail):Promise<FinishArgs>{
 const c=completionOf(run.raw_output);
 const base={explanationId:run.explanation_id,provider:c?.provider??null,model:c?.model??null,promptVersion:c?.prompt_version??PROMPT_VERSION,rawOutput:run.raw_output,accounting:c?.accounting??null,finalizePayload:run.finalize_payload};
 if(!c||c.validator_version!==VALIDATOR_VERSION){   // an envelope without versions cannot be checked by this validator either
  return {...base,state:'failed',validatorVersion:c?.validator_version??'',validation:{stage:'recovery',code:'validator_version_changed'},rendered:null,failureCodes:['validator_version_changed']};
 }
 const m=await db.manifest(run.manifest_id);
 if(!m)throw new Error(`manifest_missing:${run.manifest_id}`);   // unreachable (foreign key); the row stays running
 const facts=explanationFacts(m.body);
 const result=validateExplanation(parseModelContent(c.content),new Set(facts.map(f=>f.fact_id)));
 const validation={validator_version:VALIDATOR_VERSION,ok:result.ok,failures:result.failures,recovered:true};
 return result.ok
  ?{...base,state:'accepted',validatorVersion:VALIDATOR_VERSION,validation,rendered:renderExplanation(facts,result.output,run.locale,m.body.catalog),failureCodes:[]}
  :{...base,state:'rejected',validatorVersion:VALIDATOR_VERSION,validation,rendered:null,failureCodes:result.codes};
}
/** Completion recovery (plan audit R2-1 / R2-2). Never calls the provider and never throws: a failure leaves the row as it
 *  was for the next replay or GET. Settlement is independent of finish: the payload of the first read is immutable, so a
 *  finish or reread failure still settles it (finally path; Task 11 Codex #5). */
export async function recoverExplanation(d:RecoveryDeps,explanationId:string):Promise<void>{
 let run:RunDetail|null;
 try{run=await d.db.runDetail(explanationId);}catch{return;}
 if(!run)return;
 const {explanation_id:id,usage_audit_key:key}=run;
 let payload=run.finalize_payload;let finalized=run.finalized;
 try{
  if(run.state==='running'&&hasRecordedCompletion(run.raw_output)){
   try{await d.db.finishExplanation(await recoveredFinish(d.db,run));}catch{return;}
   try{const again=await d.db.runDetail(explanationId);if(again){payload=again.finalize_payload??payload;finalized=again.finalized;}}catch{/* settle from the first read */}
  }
 }finally{
  // TOPICS ↓
  if(payload!==null&&!finalized)await settleUsage(d.llm,key,payload,()=>d.db.markFinalized(id));
  // TOPICS ↑
 }
}
/** GET /explanations: recover the user's running rows with a recorded completion, oldest first, at most `limit`. */
export async function recoverUserExplanations(d:RecoveryDeps,userId:string,limit=RECOVER_PER_READ):Promise<number>{
 let ids:string[];
 try{ids=await d.db.recoverableRuns(userId,limit);}catch{return 0;}
 for(const id of ids)await recoverExplanation(d,id);
 return ids.length;
}

const PROMPT_URLS={zh:new URL('./prompts/macro-explain-v1.zh.md',import.meta.url),en:new URL('./prompts/macro-explain-v1.en.md',import.meta.url)};
const promptCache=new Map<'zh'|'en',string>();
export function promptText(locale:'zh'|'en'):string{
 let t=promptCache.get(locale);if(t===undefined){t=readFileSync(PROMPT_URLS[locale],'utf8');promptCache.set(locale,t);}
 return t;
}
export function userMessage(locale:'zh'|'en',facts:{fact_id:string;text:string}[]):string{
 return `${locale==='zh'?'事实清单（JSON）：':'Fact list (JSON):'}\n${JSON.stringify(facts)}`;
}
/** The model input of an explanation, rebuilt from its 'explain_facts' manifest alone (frozen facts + frozen catalog names). */
export function modelInput(m:StrategyManifest,locale:'zh'|'en'):{system:string;user:string}{
 return {system:promptText(locale),user:userMessage(locale,renderFacts(explanationFacts(m),locale,m.catalog))};
}
/** Fact manifest of the subject, stored before the claim. Review subjects are result ids (StrategyDb.reviewResult). */
async function subjectManifest(d:ExplainDeps,port:StrategyReadPort,codeVersion:string,body:ExplainBody):Promise<StrategyManifest|null>{
 if(body.subject.kind==='snapshot')return buildSnapshotFactsManifest(port,body.subject.id,codeVersion);
 const result=await d.db.reviewResult(body.subject.id);if(!result)return null;
 const review=await d.db.manifest(result.manifest_id);if(!review)return null;
 return reviewFactsManifest(review,result,codeVersion);
}
// TOPICS ↓
type Claim=Awaited<ReturnType<StrategyDb['claimExplanation']>>;
// TOPICS ↑
export async function handleExplainRequest(d:ExplainDeps,userId:string,raw:unknown):Promise<ExplainResponse>{
 // step 1 (after session + flag in the route): body + payload hash
 if(!validateBody(raw))return err(400,'invalid_body');
 const body=raw as ExplainBody;
 const payloadHash=sha256Hex(canonicalJson({subject:body.subject,locale:body.locale}));
 const claimArgs={userId,requestId:body.request_id,payloadHash,subjectKind:body.subject.kind,subjectId:body.subject.id,locale:body.locale};
 // TOPICS ↓
 const identity={actor:userId,requestId:body.request_id,payloadHash};
 const isPayloadConflict=(e:unknown)=>e instanceof StrategyDbError&&e.code==='payload_conflict';
 const replay:ValidatedRunStore<Claim>['replay']=async(actor,requestId,hash)=>{
  const prior=await d.db.runOf(actor,requestId);
  if(!prior)return {kind:'none'};
  if(prior.payload_hash!==hash)return {kind:'conflict'};
  await recoverExplanation(d,prior.explanation_id);
  try{return {kind:'replay',response:(await d.db.claimExplanation({...claimArgs,manifestId:REPLAY_MANIFEST_ID})).projection};}
  catch(e){if(isPayloadConflict(e))return {kind:'conflict'};throw e;}
 };
 return await runValidatedExplanation<Claim>({llm:d.llm,now:d.now,replay,load:async()=>{
  // step 3: code version, foundation and subject (a replay above needs none of them)
  if(!d.codeVersion)return err(503,'code_version_unavailable');
  if(!d.port)return err(503,'macro_foundation_unavailable');
  const built=await subjectManifest(d,d.port,d.codeVersion,body);
  if(!built)return err(404,'subject_not_found');
  if(explanationFacts(built).length===0)return err(422,'no_facts');
  const stored=await d.db.putManifest(built);
  const facts=explanationFacts(stored.body),catalog=stored.body.catalog;
  const store:Omit<ValidatedRunStore<Claim>,'replay'>={
   claim:()=>d.db.claimExplanation({...claimArgs,manifestId:stored.manifest_id}),isPayloadConflict,
   existing:claim=>claim.outcome==='existing'?{status:200,body:claim.projection}:null,
   auditKey:claim=>claim.usage_audit_key,
   recordCompletion:(claim,rawOutput,finalizePayload)=>d.db.recordCompletion({explanationId:claim.explanation_id,rawOutput,finalizePayload}),
   finish:(claim,r)=>d.db.finishExplanation({...r,explanationId:claim.explanation_id,promptVersion:PROMPT_VERSION,validatorVersion:VALIDATOR_VERSION,
    rendered:r.rendered as FinishArgs['rendered'],validation:r.validation as FinishArgs['validation']}),
   markFinalized:claim=>d.db.markFinalized(claim.explanation_id),
  };
  return {store,subject:()=>({
   ...modelInput(stored.body,body.locale),usageMeta:{subject_kind:body.subject.kind,subject_id:body.subject.id,locale:body.locale},
   versions:{prompt_version:PROMPT_VERSION,validator_version:VALIDATOR_VERSION},
   validate:value=>validateExplanation(value,new Set(facts.map(f=>f.fact_id))),
   render:output=>renderExplanation(facts,output as ModelOutput,body.locale,catalog),
  })};
 }},identity) as ExplainResponse;
 // TOPICS ↑
}
