'use client';
import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {evaluationQuarantineCount,prepareEvaluationQuarantineErase,eraseEvaluationQuarantine,claimEvaluationRecovery,requestEvaluationFence,acknowledgeEvaluationRecovery,EvaluationJournalError,pendingEvaluation,claimEvaluation,resumeEvaluation,acknowledgeEvaluation,type EvaluationAttempt} from './evaluation-journal';
import type {EvaluationResult} from 'dsh-trade-strategy-evaluator/engine';
type Report={revision:number;marketIds:string[];anchorStatus:string;synthetic:boolean;historyTruncated:boolean;observationKind:string;contaminationReasons:string[];evaluations:Array<{id:string;result:EvaluationResult;result_hash:string}>};
const statusNames:Record<string,string>={pending_start:'等待起点',open:'观察未到期',resolved:'已计算',data_insufficient:'行情或证据不足'};
const reasons:Record<string,string>={max_wait_exceeded:'已超过冻结政策的起点等待期',missing_start_evidence:'缺少起点行情或停牌证据',missing_benchmark:'缺少基准行情',missing_close:'缺少收盘行情',rule_unsupported:'冻结日历或政策不受支持'};
const journalMessages:Record<string,string>={evaluation_journal_unavailable:'无法读取本机计算记录，计算已暂停；仍可查看报告。',evaluation_journal_damaged:'本机待确认记录格式异常，计算已暂停；记录已保留，仍可查看报告。',evaluation_recovery_pending:'本机记录正在等待恢复确认，计算已暂停；请保留记录，仍可查看报告。',evaluation_recovery_damaged:'本机恢复记录格式异常，计算已暂停；请保留记录，仍可查看报告。',evaluation_quarantine_full:'本机隔离记录已达保留上限，计算已暂停；记录未删除，仍可查看报告。'};
const messages:Record<string,string>={evaluation_quarantine_changed:'隔离副本已变化，请重新读取后再次确认删除。',quarantine_erase_unresolved:'本机删除结果尚未确认，请重新读取记录核实；不会自动重试删除。',evaluation_fence_unavailable:'恢复结果尚未确认，请重新读取本机记录后重试恢复；不会自动新建计算。',evaluation_intent_cancelled:'此计算已取消，不会再保存；请点击核实结果以清理本机待确认记录。',evaluation_resolution_ack_unavailable:'原计算已核实或取消，但本机确认状态未知；请重新读取本机记录。',evaluation_ack_unavailable:'计算已保存，但本机确认状态未知；请重新读取本机记录，系统不会自动新建。',evaluation_journal_unavailable:'无法确认本机计算记录，计算已暂停；请重新读取本机记录。',not_configured:'观察计算尚未启用。',revocation_access_denied:'材料权限已撤回或当前账号无权访问。',revocation_check_unavailable:'暂时无法核实材料权限，请稍后重新查看报告。',scope_denied:'材料权限已撤回或当前账号无权访问。',policy_blocked:'材料授权不可用。',anchor_integrity_failed:'回执完整性异常，计算已暂停。',revision_conflict:'计算版本已变化，保留原记录等待核实；不会自动新建计算。',source_version_conflict:'冻结行情已变化，保留原记录等待核实；不会自动新建计算。',source_unavailable:'缺少可核查行情，不能计算。',data_insufficient:'数据或政策证据不足。',future_input:'计算时间超前，请重新准备计算。',invalid_timeline:'计算准备已过期，保留原记录等待核实；不会自动新建计算。'};
export function EvaluationPanel({id}:{id:string}){
 const [data,setData]=useState<Report|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const attempt=useRef<EvaluationAttempt|null>(null);
 const [journalReady,setJournalReady]=useState(false),[journalError,setJournalError]=useState<string|null>(null);
 const journalScope=useRef<string|null>(null);
 const [quarantineCount,setQuarantineCount]=useState<number|null>(null);
 const journalLoad=useRef(0),[journalLoading,setJournalLoading]=useState(false);
 // Each mount/observation owns its continuations. A late response may have
 // committed on the server, but must never publish or download after teardown.
 const generation=useRef(0);
 const request=useCallback(async(body:unknown)=>{const r=await fetch(`/api/research/s6/observations/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const result=await r.json().catch(()=>{throw Object.assign(Error('invalid_response'),{retryable:true});});if(!r.ok)throw Object.assign(Error(result.error?.code||'internal_error'),{retryable:r.status>=500});return result;},[id]);
 const loadJournal=useCallback(async()=>{
  const epoch=generation.current,load=++journalLoad.current,active=()=>generation.current===epoch&&journalLoad.current===load;setJournalReady(false);setJournalError(null);setJournalLoading(true);setQuarantineCount(null);
  try{
  let context:{journalScope:string};
  try{context=await request({action:'journal-context'});if(!active())return;if(!/^[0-9a-f]{64}$/.test(context.journalScope))throw Error('invalid_response');journalScope.current=context.journalScope;}
  catch(e){if(active()){setData(null);setNotice(messages[(e as Error).message]||`未完成：${(e as Error).message}`);}return;}
  try{const count=await evaluationQuarantineCount(context.journalScope);if(!active())return;setQuarantineCount(count);const value=await pendingEvaluation(context.journalScope);if(!active())return;journalScope.current=context.journalScope;attempt.current=value;setJournalError(null);setJournalReady(true);if(value)setNotice('发现待确认的计算，请重试同一计算核实结果。');}
  catch(error){if(active()){setJournalReady(false);setJournalError(error instanceof EvaluationJournalError?error.code:'evaluation_journal_unavailable');}}
  }finally{if(active())setJournalLoading(false);}
 },[request]);
 useLayoutEffect(()=>{const lifetime=generation;lifetime.current++;attempt.current=null;setData(null);setNotice('');setBusy(false);setJournalReady(false);setJournalError(null);setQuarantineCount(null);journalScope.current=null;
  void loadJournal();return()=>{lifetime.current++;};},[id,loadJournal]);

 async function work(fn:(read:typeof request,active:()=>boolean)=>Promise<void>){
  const current=generation.current;
  const active=()=>generation.current===current;
  const guardedRequest:typeof request=async body=>{if(!active())throw Error('view_disposed');const value=await request(body).catch(e=>{if(!active())throw Error('view_disposed');throw e;});if(!active())throw Error('view_disposed');return value;};
  setBusy(true);setNotice('');try{await fn(guardedRequest,active);}catch(e){
  if(!active())return;
  const code=(e as Error).message;
  const localFailure=e instanceof EvaluationJournalError||code==='evaluation_ack_unavailable'||code==='evaluation_resolution_ack_unavailable';
  if(localFailure){setJournalReady(false);setJournalError(e instanceof EvaluationJournalError?e.code:'evaluation_journal_unavailable');}
  setNotice(messages[code]||journalMessages[code]||`未完成：${code}`);if(!localFailure)setData(null);
 }finally{if(active())setBusy(false);}}
 const percent=(n:number)=>`${(n*100).toFixed(2)}%`;
 return <section className="mt-4 space-y-3 border-t border-border pt-3" aria-label="观察计算与回放">
  <button disabled={busy} className="text-accent underline" onClick={()=>work(async(request)=>{setData(await request({action:'read'}));})}>查看计算报告</button>
  {notice&&<p role="status">{notice}</p>}
  {journalError&&<div><p role="status">{journalMessages[journalError]||journalMessages.evaluation_journal_unavailable}</p><button disabled={busy||journalLoading} className="text-accent underline" onClick={()=>void loadJournal()}>重试读取本机计算记录</button></div>}
  {quarantineCount!==null&&quarantineCount>0&&<div><p className="text-xs text-text-dim">本机隔离副本 {quarantineCount} 份，仅保存在此浏览器，不上传。退出登录不会自动清除；删除后无法恢复。</p><button disabled={busy||journalLoading||journalError==='evaluation_recovery_pending'||journalError==='evaluation_recovery_damaged'} className="text-accent underline" onClick={()=>work(async(request,active)=>{
   const scope=journalScope.current;if(!scope)throw new EvaluationJournalError('evaluation_journal_unavailable');
   const context=await request({action:'journal-context'});if(context.journalScope!==scope){setQuarantineCount(null);await loadJournal();return;}
   const selection=await prepareEvaluationQuarantineErase(scope);if(!active())return;
   if(!window.confirm(`永久删除当前选择的 ${selection.count} 份本机隔离副本？此操作无法恢复，不会删除待确认记录或服务器结果。`))return;
   const current=await request({action:'journal-context'});if(current.journalScope!==scope){setQuarantineCount(null);await loadJournal();return;}
   let erased:number;
   try{erased=await eraseEvaluationQuarantine(scope,selection);}catch(error){
    if(!active())return;
    try{const count=await evaluationQuarantineCount(scope);if(active())setQuarantineCount(count);}catch{if(active())setQuarantineCount(null);}
    if(!active())return;
    const code=error instanceof EvaluationJournalError?error.code:'quarantine_erase_unresolved';
    if(code==='evaluation_recovery_pending'||code==='evaluation_recovery_damaged'){setJournalReady(false);setJournalError(code);}
    setNotice(code==='evaluation_journal_unavailable'?messages.quarantine_erase_unresolved:messages[code]||journalMessages[code]||messages.quarantine_erase_unresolved);return;
   }
   if(!active())return;await loadJournal();if(!active())return;setNotice(`已删除 ${erased} 份本机隔离副本；待确认记录和服务器结果未删除。`);
  })}>删除本机隔离副本</button></div>}
  {journalError&&['evaluation_journal_damaged','evaluation_recovery_pending'].includes(journalError)&&<button disabled={busy||journalLoading} className="text-accent underline" onClick={()=>work(async(request,active)=>{
   if(!window.confirm('恢复将使此前准备但尚未保存的计算失效，已保存结果不受影响。服务器确认后将清除匹配的损坏待确认记录；无法解析的原记录会尝试保留在本机隔离区；若隔离区已满则保留原记录并停止恢复，不会上传，也不会自动删除。是否继续？'))return;
   const scope=journalScope.current;if(!scope)throw new EvaluationJournalError('evaluation_journal_unavailable');
   const recovery=await claimEvaluationRecovery(scope,'ui-recovery');if(!active())return;
   if(!recovery){await loadJournal();return;}
   let confirmation;
   try{confirmation=await requestEvaluationFence(id,scope,recovery);}catch{throw Error('evaluation_fence_unavailable');}
   if(!active())return;
   const result=await acknowledgeEvaluationRecovery(scope,recovery,confirmation);if(!active())return;
   await loadJournal();if(!active())return;
   setNotice(result.status==='cleared'?'恢复已确认，可以重新准备计算。':'恢复已确认，本机记录已变化；请按当前状态继续。');
   setData(await request({action:'read'}));
  })}>确认恢复损坏的计算记录</button>}
  {(data||attempt.current)&&<button disabled={busy||journalLoading||!journalReady} className="rounded border border-border px-3 py-2" onClick={()=>work(async(request,active)=>{
    const proposed=attempt.current??{action:'evaluate',...await request({action:'prepare'}),key:crypto.randomUUID()};
    const scope=journalScope.current;if(!scope)throw Error('evaluation_journal_unavailable');
    const durable=attempt.current?await resumeEvaluation(scope,attempt.current.key):await claimEvaluation(scope,proposed);
    if(!active())return;
    if(!durable){attempt.current=null;setData(await request({action:'read'}));setNotice('本机待确认记录已不存在，已刷新报告。');return;}
    attempt.current=durable;
    // Unknown and terminal errors retain the same intent. Never silently mint a
    // replacement key: a prior delivery may already have committed.
    await request(durable);
    await acknowledgeEvaluation(scope,durable.key).catch(()=>{throw Error('evaluation_ack_unavailable');});if(!active())return;attempt.current=null;setNotice('计算版本已保存；缺行情或未到期会如实显示。');
    try{setData(await request({action:'read'}));}catch(e){if((e as Error).message==='view_disposed')throw e;setData(null);setNotice('计算版本已保存，但报告刷新失败；请重新查看报告。');}
   })}>{attempt.current?'重试同一计算':'计算当前观察'}</button>}
  {attempt.current&&<button disabled={busy||journalLoading||!journalReady} className="rounded border border-border px-3 py-2" onClick={()=>work(async(request,active)=>{
   const pending=attempt.current,scope=journalScope.current;if(!pending||!scope)throw Error('evaluation_journal_unavailable');
   const resolution=await request({action:'resolve-intent',key:pending.key});
   if(resolution.key!==pending.key||!['committed','cancelled'].includes(resolution.status))throw Error('invalid_response');
   await acknowledgeEvaluation(scope,pending.key).catch(()=>{throw Error('evaluation_resolution_ack_unavailable');});if(!active())return;attempt.current=null;
   setNotice(resolution.status==='committed'?'已核实原计算保存成功。':'已取消尚未保存的计算；迟到请求不会新建结果。');
   try{setData(await request({action:'read'}));}catch(e){if((e as Error).message==='view_disposed')throw e;setData(null);setNotice('原计算已核实或取消，但报告读取失败；请重新查看报告。');}
  })}>核实结果并取消未保存的计算</button>}
  {data&&<><p className="text-xs text-text-dim">{data.synthetic?'合成样例 · ':''}描述性观察 · 不代表组合收益 · Jev 未实测 · Brier 不适用</p>
   {data.observationKind==='shadow'&&<p>被动影子观察，不能作为独立人工基线。</p>}
   {data.contaminationReasons.length>0&&<p className="text-xs text-text-dim">非独立样本原因：{data.contaminationReasons.join('、')}</p>}
   {data.historyTruncated&&<p>仅展示最近 100 个版本；更早版本可按原评价 ID 导出。</p>}
   <p className="text-xs text-text-dim">{data.anchorStatus==='anchored'?'本机持久化回执':'回执待持久化'} · 已冻结行情 {data.marketIds.length} 份</p>
   {!data.evaluations.length&&<p>尚无计算版本。没有行情时可登记等待状态。</p>}
   {data.evaluations.map(e=><div key={e.id} className="space-y-2 rounded border border-border p-3">
    <h4 className="font-semibold">{statusNames[e.result.status]||e.result.status}</h4>
    {e.result.reason&&<p>{reasons[e.result.reason]||e.result.reason}</p>}
    <p className="text-xs">计算截至 {e.result.computed_at} · {e.result.engine_version}</p>
    <ul>{e.result.windows.map(w=><li key={w.trading_sessions}>{w.trading_sessions} 个交易日：{statusNames[w.status]}{w.reason?` · ${reasons[w.reason]||w.reason}`:''}{w.result?` · 价格变化 ${percent(w.result.price_return)} · SPY ${percent(w.result.benchmark_price_return)} · 差额 ${percent(w.result.benchmark_difference)}`:''}</li>)}</ul>
    <p className="break-all text-xs text-text-dim">结果摘要 {e.result_hash}</p>
    <button disabled={busy} className="text-accent underline" onClick={()=>work(async(request)=>{const replay=await request({action:'replay',evaluationId:e.id});const url=URL.createObjectURL(new Blob([JSON.stringify(replay,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`observation-${id}-replay.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('离线回放校验一致，已导出冻结输入与结果。');})}>校验并导出 Replay</button>
   </div>)}
  </>}
 </section>;
}
