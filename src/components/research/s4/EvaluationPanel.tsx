'use client';
import {useRef,useState} from 'react';
import type {EvaluationResult} from 'dsh-trade-strategy-evaluator/engine';
type Report={revision:number;marketIds:string[];anchorStatus:string;synthetic:boolean;historyTruncated:boolean;observationKind:string;contaminationReasons:string[];evaluations:Array<{id:string;result:EvaluationResult;result_hash:string}>};
const statusNames:Record<string,string>={pending_start:'等待起点',open:'观察未到期',resolved:'已计算',data_insufficient:'行情或证据不足'};
const reasons:Record<string,string>={max_wait_exceeded:'已超过冻结政策的起点等待期',missing_start_evidence:'缺少起点行情或停牌证据',missing_benchmark:'缺少基准行情',missing_close:'缺少收盘行情',rule_unsupported:'冻结日历或政策不受支持'};
export function EvaluationPanel({id}:{id:string}){
 const [data,setData]=useState<Report|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const attempt=useRef<Record<string,unknown>|null>(null);
 async function request(body:unknown){const r=await fetch(`/api/research/s6/observations/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const result=await r.json().catch(()=>{throw Object.assign(Error('invalid_response'),{retryable:true});});if(!r.ok)throw Object.assign(Error(result.error?.code||'internal_error'),{retryable:r.status>=500});return result;}
 async function work(fn:()=>Promise<void>){setBusy(true);setNotice('');try{await fn();}catch(e){
  const code=(e as Error).message;const messages:Record<string,string>={not_configured:'观察计算尚未启用。',revocation_access_denied:'材料权限已撤回或当前账号无权访问。',revocation_check_unavailable:'暂时无法核实材料权限，请稍后重新查看报告。',scope_denied:'材料权限已撤回或当前账号无权访问。',policy_blocked:'材料授权不可用。',anchor_integrity_failed:'回执完整性异常，计算已暂停。',revision_conflict:'已有新的计算版本，请刷新后重新计算。',source_version_conflict:'已有新的冻结行情，请刷新后重新计算。',source_unavailable:'缺少可核查行情，不能计算。',data_insufficient:'数据或政策证据不足。',future_input:'计算时间超前，请重新准备计算。',invalid_timeline:'计算准备已过期，请重新准备计算。'};
  setNotice(messages[code]||`未完成：${code}`);setData(null);if(!(e instanceof TypeError)&&!(e as {retryable?:boolean}).retryable)attempt.current=null;
 }finally{setBusy(false);}}
 const percent=(n:number)=>`${(n*100).toFixed(2)}%`;
 return <section className="mt-4 space-y-3 border-t border-border pt-3" aria-label="观察计算与回放">
  <button disabled={busy} className="text-accent underline" onClick={()=>work(async()=>{setData(await request({action:'read'}));})}>查看计算报告</button>
  {notice&&<p role="status">{notice}</p>}
  {data&&<><p className="text-xs text-text-dim">{data.synthetic?'合成样例 · ':''}描述性观察 · 不代表组合收益 · Jev 未实测 · Brier 不适用</p>
   {data.observationKind==='shadow'&&<p>被动影子观察，不能作为独立人工基线。</p>}
   {data.contaminationReasons.length>0&&<p className="text-xs text-text-dim">非独立样本原因：{data.contaminationReasons.join('、')}</p>}
   {data.historyTruncated&&<p>仅展示最近 100 个版本；更早版本可按原评价 ID 导出。</p>}
   <p className="text-xs text-text-dim">{data.anchorStatus==='anchored'?'本机持久化回执':'回执待持久化'} · 已冻结行情 {data.marketIds.length} 份</p>
   <button disabled={busy} className="rounded border border-border px-3 py-2" onClick={()=>work(async()=>{
    attempt.current??={action:'evaluate',...await request({action:'prepare'}),key:crypto.randomUUID()};
    await request(attempt.current);attempt.current=null;setNotice('计算版本已保存；缺行情或未到期会如实显示。');
    try{setData(await request({action:'read'}));}catch{setData(null);setNotice('计算版本已保存，但报告刷新失败；请重新查看报告。');}
   })}>{attempt.current?'重试同一计算':'计算当前观察'}</button>
   {!data.evaluations.length&&<p>尚无计算版本。没有行情时可登记等待状态。</p>}
   {data.evaluations.map(e=><div key={e.id} className="space-y-2 rounded border border-border p-3">
    <h4 className="font-semibold">{statusNames[e.result.status]||e.result.status}</h4>
    {e.result.reason&&<p>{reasons[e.result.reason]||e.result.reason}</p>}
    <p className="text-xs">计算截至 {e.result.computed_at} · {e.result.engine_version}</p>
    <ul>{e.result.windows.map(w=><li key={w.trading_sessions}>{w.trading_sessions} 个交易日：{statusNames[w.status]}{w.reason?` · ${reasons[w.reason]||w.reason}`:''}{w.result?` · 价格变化 ${percent(w.result.price_return)} · SPY ${percent(w.result.benchmark_price_return)} · 差额 ${percent(w.result.benchmark_difference)}`:''}</li>)}</ul>
    <p className="break-all text-xs text-text-dim">结果摘要 {e.result_hash}</p>
    <button disabled={busy} className="text-accent underline" onClick={()=>work(async()=>{const replay=await request({action:'replay',evaluationId:e.id});const url=URL.createObjectURL(new Blob([JSON.stringify(replay,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`observation-${id}-replay.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('离线回放校验一致，已导出冻结输入与结果。');})}>校验并导出 Replay</button>
   </div>)}
  </>}
 </section>;
}
