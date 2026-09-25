/** Structural two-leg readiness only. Neither provider claim is trusted for evaluation. */
import {digest,fail,parseStrict} from '../ingest/pa-v1/json.js';
import {validateMarketHandoff,type MarketHandoff} from './market-handoff';
import proposal from '../../../../docs/handoffs/alpha-s6/market-interface/policy-v2.proposal.json';
import parentPolicy from '../../../../docs/handoffs/alpha-s4/market-policy.json';
import calendar from '../../../../docs/handoffs/alpha-s4/calendar.json';

export function validateMarketPair(targetRaw:string|Buffer,benchmarkRaw:string|Buffer,now=new Date().toISOString()){
 if(proposal.status!=='unreleased'||proposal.real_evaluation!=='closed_until_versioned_engine_and_trusted_evidence'||proposal.session_calendar.version!==calendar.version||proposal.parent_market_policy_sha256!==digest(parentPolicy)||proposal.session_calendar.calendar_mic!==calendar.version.split('-')[0])fail('rule_unsupported');
 let targetCheck:ReturnType<typeof validateMarketHandoff>,benchmarkCheck:ReturnType<typeof validateMarketHandoff>;
 try{targetCheck=validateMarketHandoff(targetRaw,now);}catch(error){if(error&&typeof error==='object')Object.assign(error,{leg:'target'});throw error;}
 try{benchmarkCheck=validateMarketHandoff(benchmarkRaw,now);}catch(error){if(error&&typeof error==='object')Object.assign(error,{leg:'benchmark'});throw error;}
 const target=parseStrict(targetRaw) as MarketHandoff,benchmark=parseStrict(benchmarkRaw) as MarketHandoff;
 if(!proposal.target_listing_mics.includes(target.security.listing_mic))fail('market_identity_mismatch');
 if(target.security.ticker==='SPY'||benchmark.security.ticker!==proposal.benchmark.ticker||benchmark.security.listing_mic!==proposal.benchmark.listing_mic||target.security.ticker===benchmark.security.ticker)fail('market_identity_mismatch');
 // Schema v1 currently fixes USD and the frozen calendar; retain this check for a later version.
 if(target.calendar_version!==proposal.session_calendar.version||benchmark.security.currency!==proposal.benchmark.currency)fail('pair_mismatch');
 if(target.synthetic!==benchmark.synthetic||target.calendar_version!==benchmark.calendar_version||target.range.from!==benchmark.range.from||target.range.to!==benchmark.range.to||target.splits.basis_date!==benchmark.splits.basis_date)fail('pair_mismatch');
 const samePricePath=!target.synthetic&&target.bars.length===benchmark.bars.length&&target.bars.length>0&&target.bars.every((b,i)=>{const other=benchmark.bars[i];return b.session_date===other.session_date&&b.open===other.open&&b.high===other.high&&b.low===other.low&&b.close===other.close&&b.volume===other.volume;});
 const targetPriceHashes=new Set(target.evidence.filter(e=>e.kind==='prices').map(e=>e.sha256));
 const sharedPriceEvidence=!target.synthetic&&benchmark.evidence.some(e=>e.kind==='prices'&&targetPriceHashes.has(e.sha256));
 const targetBars=new Set(target.bars.map(b=>b.session_date)),benchmarkBars=new Set(benchmark.bars.map(b=>b.session_date));
 const sessions=calendar.sessions.filter(s=>s.date>=target.range.from&&s.date<=target.range.to);
 const aligned=sessions.filter(s=>targetBars.has(s.date)&&benchmarkBars.has(s.date)).map(s=>s.date);
 const unavailable=sessions.filter(s=>!targetBars.has(s.date)||!benchmarkBars.has(s.date)).map(s=>({session_date:s.date,
  target:targetBars.has(s.date)?'bar':target.unavailable_sessions.some(x=>x.session_date===s.date)?'unavailable':'missing',
  benchmark:benchmarkBars.has(s.date)?'bar':benchmark.unavailable_sessions.some(x=>x.session_date===s.date)?'unavailable':'missing'}));
 return {schema_version:'alpha-market-pair-check/1.0',status:targetCheck.status==='contract_valid'&&benchmarkCheck.status==='contract_valid'&&aligned.length>0&&unavailable.length===0&&!sharedPriceEvidence&&!samePricePath?'contract_valid':'contract_incomplete',
  proposed_policy_status:proposal.status,proposed_policy_jcs_sha256:digest(proposal),
  pair_sha256:digest({policy:digest(proposal),calendar:digest(calendar),target:targetCheck.bundle_sha256,benchmark:benchmarkCheck.bundle_sha256}),target:{ticker:target.security.ticker,listing_mic:target.security.listing_mic,bundle_sha256:targetCheck.bundle_sha256},
  benchmark:{ticker:benchmark.security.ticker,listing_mic:benchmark.security.listing_mic,bundle_sha256:benchmarkCheck.bundle_sha256},calendar_version:target.calendar_version,range:target.range,
  aligned_session_count:aligned.length,unavailable_sessions:unavailable,
  readiness:'provider_claims_unverified',accepted_for_evaluation:false,engine_compatible:false,
  blockers:[...new Set([...targetCheck.blockers,...benchmarkCheck.blockers,'benchmark_identity_unverified','calendar_venue_compatibility_unverified','pair_source_rights_unverified',...(sharedPriceEvidence?['legs_share_price_evidence']:[]),...(samePricePath?['legs_have_identical_price_path']:[]),...(unavailable.length?['unaligned_sessions']:[]),...(unavailable.some(s=>s.target==='unavailable'||s.benchmark==='unavailable')?['documented_unavailable_sessions']:[])])],
  availability_basis:'local_retrieval_only'};
}
