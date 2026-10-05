'use client';
import {createViewRequests,ObsoleteViewRequest} from '@/lib/research/s4/view-requests';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ChangeCards,type CardView} from '@/components/research/s4/ChangeCards';
import {DecisionForm,type OptionsView} from '@/components/research/s4/DecisionForm';
import {EvaluationPanel} from '@/components/research/s4/EvaluationPanel';
type PageCursor={createdAt:string;id:string};
const base='/api/research/s4';
const explanations:Record<string,string>={submission_unresolved:'提交结果尚未确认。请重新核实权限后刷新历史；重试决定将沿用原始提交内容与请求键。',revocation_access_denied:'材料授权已撤回或过期，已隐藏此前显示的内容。',revocation_check_unavailable:'暂时无法核实材料权限，已隐藏此前内容。请稍后手动重试；你的未提交判断仍保留。',export_watermark_ahead:'授权同步尚未追上此导出包，请稍后手动重试。',invalid_revocation_candidate:'候选包的授权引用无效，请核对已批准的导出包。',network_unavailable:'网络请求未完成，已隐藏此前内容。你的未提交判断仍保留。',invalid_response:'服务返回无法识别的结果，请稍后重试。',observation_scope_conflict:'所选证券、公司或研究观点与原观察不同。请追加新观察；延期须保留原范围。',anchor_integrity_failed:'回执链完整性检查失败，新增登记已暂停。请由操作员核查数据库与原始备份。',data_insufficient:'当前冻结日历不足以覆盖新观察窗口，请先发布新的规则版本。原记录不会改写。',input_limit:'输入超过当前容量限制，请减小文件。',future_input:'资料包含未来可用时间，不能进入当前输入。',source_version_conflict:'同一资料版本已登记不同内容或元数据。',hash_mismatch:'内容摘要不匹配，请核对原包。',internal_error:'服务暂时未能完成请求，请重试或查看本地服务日志。',not_authenticated:'请先登录获准的研究账号。',not_configured:'本地观察服务尚未启用。',scope_denied:'当前账号没有这份材料的权限，或授权已撤回。',policy_blocked:'材料授权已过期或变更，需重新确认授权。',revision_conflict:'已有新决定，请重新查看后提交。',idempotency_conflict:'该请求键已用于另一份决定。',security_unresolved:'请选择符合当前规则的证券；公司可保持未解决。',exposure_required:'请先保存已有判断并查看本周变化卡。',invalid_schema:'请检查必填字段及文件格式。',fixture_not_operational:'测试 golden 不能作为真实候选导入。'};
async function fetchRequest(path:string,body?:unknown,raw=false){
  const res=await fetch(base+path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:raw?String(body):JSON.stringify(body)}).catch(()=>{throw new Error('network_unavailable');});
  const data=await res.json().catch(()=>{throw new Error('invalid_response');});if(!res.ok)throw new Error(data?.error?.code||'request_failed');
  const resource=path.split('?')[0];
  if(!data||typeof data!=='object'||(resource==='/candidates'&&body===undefined&&!Array.isArray(data.candidates))||(resource==='/options'&&(!Array.isArray(data.securities)||!Array.isArray(data.companies)))||(/\/status$/.test(resource)&&!Array.isArray(data.observations))||(/\/history$/.test(resource)&&!Array.isArray(data.records))||(/\/reveal$/.test(resource)&&(!Array.isArray(data.cards)||!Number.isInteger(data.revision))))throw new Error('invalid_response');
  if(resource==='/candidates'&&body===undefined&&data.nextCursor!=null&&(typeof data.nextCursor!=='object'||Object.keys(data.nextCursor).sort().join(',')!=='createdAt,id'||typeof data.nextCursor.id!=='string'||typeof data.nextCursor.createdAt!=='string'||data.nextCursor.id.length!==36||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(data.nextCursor.createdAt)))throw new Error('invalid_response');
  return data;
}
export default function ObservationsPage(){
  const [candidates,setCandidates]=useState<Array<{id:string;revision:number;status:string;created_at:string}>>([]);
  const [options,setOptions]=useState<OptionsView>({securities:[],companies:[]}),[selected,setSelected]=useState('');
  const [judgment,setJudgment]=useState(''),[seen,setSeen]=useState(''),[independent,setIndependent]=useState(false);
  const [revealed,setRevealed]=useState<any>(null),[cardId,setCardId]=useState(''),[history,setHistory]=useState<any[]>([]);
  const [citation,setCitation]=useState<any>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);
  const [optionsReady,setOptionsReady]=useState(false),[optionsFailed,setOptionsFailed]=useState(false);
  const optionsSequence=useRef(0);
  const [nextCursor,setNextCursor]=useState<PageCursor|null>(null),[onLaterPage,setOnLaterPage]=useState(false);
  const attemptedPage=useRef<PageCursor|null>(null);
  const [listState,setListState]=useState<'loading'|'ready'|'failed'>('loading');
  const [unavailable,setUnavailable]=useState(false),[decisionVisible,setDecisionVisible]=useState(false);
  const [decisionPending,setDecisionPending]=useState(false);
  const pendingDecision=useRef<Record<string,unknown>|null>(null);
  const mounted=useRef(true),listSequence=useRef(0),citationSequence=useRef(0);
  const view=useRef<ReturnType<typeof createViewRequests>|null>(null);
  if(!view.current)view.current=createViewRequests(()=>{setRevealed(null);setCardId('');setCitation(null);setHistory([]);setUnavailable(true);});
  const request=useCallback(async(path:string,body?:unknown,raw=false)=>{try{return await view.current!.run(()=>fetchRequest(path,body,raw));}catch(e){if((e instanceof ObsoleteViewRequest||e instanceof Error&&['network_unavailable','invalid_response','internal_error','request_failed'].includes(e.message))&&mounted.current&&(path==='/candidates'&&body!==undefined||/\/(reveal|decisions)$/.test(path)))throw new Error('submission_unresolved');throw e;}},[]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;view.current!.invalidate();};},[]);
  const current=useRef('');
  const attempt=useRef({signature:'',key:''});
  const report=useCallback((e:unknown)=>{if(!mounted.current||e instanceof ObsoleteViewRequest)return;const code=e instanceof Error?e.message:'internal_error';setNotice(explanations[code]||`操作失败：${code}`);},[]);
  const load=useCallback(async(cursor:PageCursor|null=null)=>{const sequence=++listSequence.current;attemptedPage.current=cursor;setListState('loading');const query=cursor?'?'+new URLSearchParams(cursor).toString():'';try{const a=await fetchRequest('/candidates'+query);if(!mounted.current||sequence!==listSequence.current)return;setCandidates(a.candidates);setNextCursor(a.nextCursor??null);setOnLaterPage(cursor!==null);setListState('ready');}catch(e){if(mounted.current&&sequence===listSequence.current){setCandidates([]);setListState('failed');}throw e;}},[]);
  const loadOptions=useCallback(async()=>{const sequence=++optionsSequence.current;try{const data=await fetchRequest('/options');if(mounted.current&&sequence===optionsSequence.current){setOptions(data);setOptionsReady(true);setOptionsFailed(false);}}catch{if(mounted.current&&sequence===optionsSequence.current){setOptionsReady(false);setOptionsFailed(true);}}},[]);
  useEffect(()=>{void loadOptions();},[loadOptions]);
  useEffect(()=>{load().catch(report).finally(()=>setLoading(false));},[load,report]);
  // Revalidate access without redisplaying material. Clear visible cached content on revocation.
  useEffect(()=>{if(!selected||unavailable)return;const timer=setInterval(()=>{request(`/candidates/${selected}/status`).then(data=>{if(current.current===selected)setHistory(prev=>prev.map(r=>({...r,...data.observations.find((s:any)=>s.observation_id===r.id)})));}).catch(report);},10000);return()=>clearInterval(timer);},[selected,unavailable,report,request]);
  function choose(id:string){pendingDecision.current=null;setDecisionPending(false);view.current!.invalidate();citationSequence.current++;setUnavailable(false);setDecisionVisible(false);current.current=id;setSelected(id);setJudgment('');setSeen('');setIndependent(false);setRevision(candidates.find(c=>c.id===id)?.revision||0);setRevealed(null);setCardId('');setHistory([]);setCitation(null);setNotice('');attempt.current={signature:'',key:''};}
  async function upload(file:File){setBusy(true);setNotice('');try{if(file.size>2*1024*1024)throw new Error('文件不得超过 2 MiB');const data=await request('/candidates',await file.text(),true);choose(data.id);setNotice(data.duplicate?'候选已存在，已恢复记录。':'候选已保存。');try{await load();}catch{setNotice('候选已保存，但列表刷新失败。请手动重试读取候选。');}}catch(e){report(e);}finally{setBusy(false);}}
  async function reveal(e:React.FormEvent){e.preventDefault();setBusy(true);setNotice('');try{
    const body={judgment,alreadySeen:seen.split('\n').map(s=>s.trim()).filter(Boolean),independentJudgment:!decisionVisible&&independent};const signature=JSON.stringify([selected,body]);
    if(attempt.current.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};
    const data=await request(`/candidates/${selected}/reveal`,{...body,requestKey:attempt.current.key});setUnavailable(false);setDecisionVisible(true);setRevealed(data);setCardId(data.cards[0]?.id||'');setRevision(data.revision);
  }catch(e){report(e);}finally{setBusy(false);}}
  async function historyLoad(){const data=await request(`/candidates/${selected}/history`,{});if(current.current===selected){setHistory(data.records);setRevision(data.revision);}}
  async function cite(id:string,index:number){const sequence=++citationSequence.current;try{const data=await request(`/candidates/${selected}/citation?cardId=${id}&index=${index}`,{});if(sequence===citationSequence.current)setCitation(data);}catch(e){report(e);}}
  async function decide(body:Record<string,unknown>){setBusy(true);setNotice('');
   pendingDecision.current??={...body,cardId,labelId:revealed.labelId,exposureId:revealed.exposureId};setDecisionPending(true);
   try{await request(`/candidates/${selected}/decisions`,pendingDecision.current);pendingDecision.current=null;setDecisionPending(false);setNotice('决定已保存。');
    try{await historyLoad();await load(attemptedPage.current);}catch{setNotice('决定已保存，但资料刷新失败。请重新核实权限后刷新历史，无需重复提交。');}
   }catch(e){if(e instanceof Error&&['revision_conflict','idempotency_conflict','scope_denied','policy_blocked','revocation_access_denied','invalid_schema','security_unresolved','exposure_required'].includes(e.message)){pendingDecision.current=null;setDecisionPending(false);}report(e);}finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-5xl space-y-6 text-text">
    <header><h1 className="text-2xl font-semibold">变化与观察</h1><p className="mt-2 text-sm text-text-dim">先留下已有判断，再看系统变化卡。决定与观察保留历史，无行情时继续等待。</p></header>
    {unavailable&&<p role="status">此前材料已隐藏，自动检查已暂停。未提交的草稿仍保留。{selected&&<button disabled={busy} className="ml-2 underline" onClick={()=>request(`/candidates/${selected}/status`).then(()=>setUnavailable(false)).catch(report)}>重新核实权限</button>}</p>}
    {notice&&<p role="status" className="rounded-lg border border-warn p-3 text-sm">{notice}</p>}
    <section className="space-y-3 rounded-lg border border-border bg-bg-card p-4" aria-label="候选资料入口">
      <h2 className="text-lg font-semibold">候选资料</h2><label className="block text-sm">导入已获准的 PA 候选包<input aria-label="导入候选包" type="file" accept=".json,application/json" disabled={busy||decisionPending} className="mt-2 block w-full text-sm" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/></label>
      <label className="block text-sm">选择候选<select aria-label="选择候选" value={selected} onChange={e=>choose(e.target.value)} disabled={busy||decisionPending} className="mt-1 w-full rounded border border-border bg-bg p-2">
        <option value="">{loading?'正在读取…':'请选择候选'}</option>{selected&&!candidates.some(c=>c.id===selected)&&<option value={selected}>当前候选（列表待确认）</option>}{candidates.map(c=><option key={c.id} value={c.id}>{new Date(c.created_at).toLocaleString()} · {c.id.slice(0,8)} · {c.status}</option>)}</select></label>
      {listState==='failed'&&<p role="status">候选列表暂不可用，不能据此判断没有资料。<button disabled={busy} onClick={()=>load(attemptedPage.current).catch(report)} className="ml-2 underline">重试读取候选</button></p>}
      {listState==='failed'&&attemptedPage.current&&<button disabled={busy} onClick={()=>load().catch(report)} className="text-sm underline">返回第一页</button>}
      {listState==='ready'&&<div className="flex gap-3 text-sm">{onLaterPage&&<button disabled={busy} onClick={()=>load().catch(report)} className="underline">返回第一页</button>}{nextCursor&&<button disabled={busy} onClick={()=>load(nextCursor).catch(report)} className="underline">下一页候选</button>}</div>}
      {listState==='ready'&&!loading&&!candidates.length&&<p className="text-sm text-text-dim">{onLaterPage?'本页没有更多候选。':'尚无可访问候选。导入后即可开始记录。'}</p>}
    </section>
    {selected&&!revealed&&<form onSubmit={reveal} className="space-y-3 rounded-lg border border-border bg-bg-card p-4" aria-label="查看前记录">
      <h2 className="text-lg font-semibold">{decisionVisible?'重新查看材料（此前已查看）':'查看前，记录你的判断'}</h2>
      <label className="block text-sm">已有判断<textarea aria-label="已有判断" required maxLength={4000} rows={3} value={judgment} onChange={e=>setJudgment(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg p-2" placeholder="没有形成判断也可以如实记录。"/></label>
      <label className="block text-sm">已看材料（每行一项）<textarea aria-label="已看材料" rows={2} value={seen} onChange={e=>setSeen(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg p-2"/></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={decisionVisible} checked={!decisionVisible&&independent} onChange={e=>setIndependent(e.target.checked)}/>我在查看系统卡之前已形成独立判断</label>
      <p className="text-xs text-text-dim">此声明会原样保存；上游暴露历史未知或由代理操作时，仍标为描述性记录。</p>
      <button disabled={busy} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{busy?'正在记录…':'保存已有判断并查看变化卡'}</button>
    </form>}
    {revealed&&<><ChangeCards cards={revealed.cards as CardView[]} selected={cardId} onSelect={id=>{citationSequence.current++;setCitation(null);setCardId(id);}} onCitation={cite}/>
      {citation&&<section aria-label="引用原文" className="rounded-lg border border-accent bg-bg-card p-4"><h2 className="font-semibold">引用原文</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{citation.text}</p><p className="mt-2 break-all text-xs text-text-dim">版本摘要：{citation.source_ref.raw_sha256} · UTF-8 字节 {citation.span.start}–{citation.span.end}</p><button onClick={()=>setCitation(null)} className="mt-2 text-sm underline">收起引用</button></section>}
      </>}
    {optionsFailed&&<p role="status">决定选项暂不可用，暂不能提交决定。<button className="ml-2 underline" onClick={()=>void loadOptions()}>重试读取决定选项</button></p>}
    {selected&&decisionVisible&&<DecisionForm key={selected} options={options} revision={revision} busy={busy} lockDraft={decisionPending} blocked={!revealed||unavailable||!optionsReady} onSubmit={decide}/>}
    {selected&&<section className="space-y-3" aria-label="复核与观察历史"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">复核与观察历史</h2><button disabled={busy} onClick={()=>historyLoad().catch(report)} className="text-sm text-accent underline">查看 / 刷新历史</button></div>
      {history.filter(r=>['Decision','Observation'].includes(r.kind)).map(r=><article key={r.id} className="rounded-lg border border-border bg-bg-card p-4 text-sm">
        {r.kind==='Decision'?<><h3 className="font-semibold">决定 · {r.payload.action} · 版本 {r.payload.revision}</h3><p className="mt-2 whitespace-pre-wrap">{r.payload.reason}</p><p className="mt-2 text-xs text-text-dim">{r.payload.review_at?`下次复核：${new Date(r.payload.review_at).toLocaleString()}`:'尚未指定下次复核时间'}{r.payload.preserves_original_window?' · 保留原观察窗口':''}</p></>:
        <><h3 className="font-semibold">冻结观察 · {r.status==='pending_start'?'等待起点':r.status}</h3><p className="mt-2">{r.anchor_status==='anchored'?'已取得本机持久化回执':r.anchor_status==='integrity_failed'?'回执完整性检查失败':'回执待持久化'} · 描述性记录</p><p className="mt-2 text-text-dim">{r.payload.securities.map((s:any)=>s.ticker).join('、')} · 窗口 {r.payload.windows.map((w:any)=>w.trading_sessions).join(' / ')} 个交易日 · 评估结果见下方报告</p><p className="mt-2 break-all text-xs text-text-dim">冻结时间 {r.payload.frozen_at} · 摘要 {r.payload_hash}</p></>}
        {r.kind==='Observation'&&<EvaluationPanel key={r.id} id={r.id}/>}
      </article>)}
    </section>}
  </div>;
}
