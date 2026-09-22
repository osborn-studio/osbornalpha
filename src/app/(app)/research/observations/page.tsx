'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ChangeCards,type CardView} from '@/components/research/s4/ChangeCards';
import {DecisionForm,type OptionsView} from '@/components/research/s4/DecisionForm';
const base='/api/research/s4';
const explanations:Record<string,string>={observation_scope_conflict:'所选证券、公司或研究观点与原观察不同。请追加新观察；延期须保留原范围。',anchor_integrity_failed:'回执链完整性检查失败，新增登记已暂停。请由操作员核查数据库与原始备份。',data_insufficient:'当前冻结日历不足以覆盖新观察窗口，请先发布新的规则版本。原记录不会改写。',input_limit:'输入超过当前容量限制，请减小文件。',future_input:'资料包含未来可用时间，不能进入当前输入。',source_version_conflict:'同一资料版本已登记不同内容或元数据。',hash_mismatch:'内容摘要不匹配，请核对原包。',internal_error:'服务暂时未能完成请求，请重试或查看本地服务日志。',not_authenticated:'请先登录获准的研究账号。',not_configured:'本地观察服务尚未启用。',scope_denied:'当前账号没有这份材料的权限，或授权已撤回。',policy_blocked:'材料授权已过期或变更，需重新确认授权。',revision_conflict:'已有新决定，请重新查看后提交。',idempotency_conflict:'该请求键已用于另一份决定。',security_unresolved:'请选择符合当前规则的证券；公司可保持未解决。',exposure_required:'请先保存已有判断并查看本周变化卡。',invalid_schema:'请检查必填字段及文件格式。',fixture_not_operational:'测试 golden 不能作为真实候选导入。'};
async function request(path:string,body?:unknown,raw=false){
  const res=await fetch(base+path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:raw?String(body):JSON.stringify(body)});
  const data=await res.json();if(!res.ok)throw new Error(data.error?.code||'request_failed');return data;
}
export default function ObservationsPage(){
  const [candidates,setCandidates]=useState<Array<{id:string;revision:number;status:string;created_at:string}>>([]);
  const [options,setOptions]=useState<OptionsView>({securities:[],companies:[]}),[selected,setSelected]=useState('');
  const [judgment,setJudgment]=useState(''),[seen,setSeen]=useState(''),[independent,setIndependent]=useState(false);
  const [revealed,setRevealed]=useState<any>(null),[cardId,setCardId]=useState(''),[history,setHistory]=useState<any[]>([]);
  const [citation,setCitation]=useState<any>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);
  const current=useRef('');
  const attempt=useRef({signature:'',key:''});
  const report=useCallback((e:unknown)=>{const code=(e as Error).message;setNotice(explanations[code]||`操作失败：${code}`);if(['scope_denied','policy_blocked','not_authenticated'].includes(code)){setRevealed(null);setCitation(null);setHistory([]);}},[]);
  const load=useCallback(async()=>{const [a,b]=await Promise.all([request('/candidates'),request('/options')]);setCandidates(a.candidates);setOptions(b);},[]);
  useEffect(()=>{load().catch(report).finally(()=>setLoading(false));},[load,report]);
  // Revalidate access without redisplaying material. Clear visible cached content on revocation.
  useEffect(()=>{if(!selected)return;const timer=setInterval(()=>{request(`/candidates/${selected}/status`).then(data=>{if(current.current===selected)setHistory(prev=>prev.map(r=>({...r,...data.observations.find((s:any)=>s.observation_id===r.id)})));}).catch(report);},10000);return()=>clearInterval(timer);},[selected,report]);
  function choose(id:string){current.current=id;setSelected(id);setJudgment('');setSeen('');setIndependent(false);setRevision(candidates.find(c=>c.id===id)?.revision||0);setRevealed(null);setCardId('');setHistory([]);setCitation(null);setNotice('');attempt.current={signature:'',key:''};}
  async function upload(file:File){setBusy(true);setNotice('');try{if(file.size>2*1024*1024)throw new Error('文件不得超过 2 MiB');const data=await request('/candidates',await file.text(),true);await load();choose(data.id);setNotice(data.duplicate?'候选已存在，已恢复记录。':'候选已验证并写入数据库。');}catch(e){report(e);}finally{setBusy(false);}}
  async function reveal(e:React.FormEvent){e.preventDefault();setBusy(true);setNotice('');try{
    const body={judgment,alreadySeen:seen.split('\n').map(s=>s.trim()).filter(Boolean),independentJudgment:independent};const signature=JSON.stringify([selected,body]);
    if(attempt.current.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};
    const data=await request(`/candidates/${selected}/reveal`,{...body,requestKey:attempt.current.key});setRevealed(data);setCardId(data.cards[0]?.id||'');setRevision(data.revision);
  }catch(e){report(e);}finally{setBusy(false);}}
  async function historyLoad(){const data=await request(`/candidates/${selected}/history`,{});if(current.current===selected){setHistory(data.records);setRevision(data.revision);}}
  async function decide(body:Record<string,unknown>){setBusy(true);setNotice('');try{
    await request(`/candidates/${selected}/decisions`,{...body,cardId,labelId:revealed.labelId,exposureId:revealed.exposureId});await historyLoad();await load();setNotice('决定已保存。观察保持等待起点，回执将在持久化后更新。');
  }catch(e){report(e);}finally{setBusy(false);}}
  return <div className="mx-auto max-w-5xl space-y-6 text-text">
    <header><h1 className="text-2xl font-semibold">变化与观察</h1><p className="mt-2 text-sm text-text-dim">先留下已有判断，再看系统变化卡。决定与观察保留历史，无行情时继续等待。</p></header>
    {notice&&<p role="status" className="rounded-lg border border-warn p-3 text-sm">{notice}</p>}
    <section className="space-y-3 rounded-lg border border-border bg-bg-card p-4" aria-label="候选资料入口">
      <h2 className="text-lg font-semibold">候选资料</h2><label className="block text-sm">导入已获准的 PA 候选包<input aria-label="导入候选包" type="file" accept=".json,application/json" disabled={busy} className="mt-2 block w-full text-sm" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/></label>
      <label className="block text-sm">选择候选<select aria-label="选择候选" value={selected} onChange={e=>choose(e.target.value)} disabled={busy} className="mt-1 w-full rounded border border-border bg-bg p-2">
        <option value="">{loading?'正在读取…':'请选择候选'}</option>{candidates.map(c=><option key={c.id} value={c.id}>{new Date(c.created_at).toLocaleString()} · {c.id.slice(0,8)} · {c.status}</option>)}</select></label>
      {!loading&&!candidates.length&&<p className="text-sm text-text-dim">尚无可访问候选。导入后即可开始记录。</p>}
    </section>
    {selected&&!revealed&&<form onSubmit={reveal} className="space-y-3 rounded-lg border border-border bg-bg-card p-4" aria-label="查看前记录">
      <h2 className="text-lg font-semibold">查看前，记录你的判断</h2>
      <label className="block text-sm">已有判断<textarea aria-label="已有判断" required maxLength={4000} rows={3} value={judgment} onChange={e=>setJudgment(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg p-2" placeholder="没有形成判断也可以如实记录。"/></label>
      <label className="block text-sm">已看材料（每行一项）<textarea aria-label="已看材料" rows={2} value={seen} onChange={e=>setSeen(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg p-2"/></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={independent} onChange={e=>setIndependent(e.target.checked)}/>我在查看系统卡之前已形成独立判断</label>
      <p className="text-xs text-text-dim">此声明会原样保存；上游暴露历史未知或由代理操作时，仍标为描述性记录。</p>
      <button disabled={busy} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{busy?'正在记录…':'保存已有判断并查看变化卡'}</button>
    </form>}
    {revealed&&<><ChangeCards cards={revealed.cards as CardView[]} selected={cardId} onSelect={setCardId} onCitation={(id,index)=>{request(`/candidates/${selected}/citation?cardId=${id}&index=${index}`,{}).then(data=>{if(current.current===selected)setCitation(data);}).catch(report);}}/>
      {citation&&<section aria-label="引用原文" className="rounded-lg border border-accent bg-bg-card p-4"><h2 className="font-semibold">引用原文</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{citation.text}</p><p className="mt-2 break-all text-xs text-text-dim">版本摘要：{citation.source_ref.raw_sha256} · UTF-8 字节 {citation.span.start}–{citation.span.end}</p><button onClick={()=>setCitation(null)} className="mt-2 text-sm underline">收起引用</button></section>}
      <DecisionForm key={selected} options={options} revision={revision} busy={busy} onSubmit={decide}/></>}
    {selected&&<section className="space-y-3" aria-label="复核与观察历史"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">复核与观察历史</h2><button disabled={busy} onClick={()=>historyLoad().catch(report)} className="text-sm text-accent underline">查看 / 刷新历史</button></div>
      {history.filter(r=>['Decision','Observation'].includes(r.kind)).map(r=><article key={r.id} className="rounded-lg border border-border bg-bg-card p-4 text-sm">
        {r.kind==='Decision'?<><h3 className="font-semibold">决定 · {r.payload.action} · 版本 {r.payload.revision}</h3><p className="mt-2 whitespace-pre-wrap">{r.payload.reason}</p><p className="mt-2 text-xs text-text-dim">{r.payload.review_at?`下次复核：${new Date(r.payload.review_at).toLocaleString()}`:'尚未指定下次复核时间'}{r.payload.preserves_original_window?' · 保留原观察窗口':''}</p></>:
        <><h3 className="font-semibold">冻结观察 · {r.status==='pending_start'?'等待起点':r.status}</h3><p className="mt-2">{r.anchor_status==='anchored'?'已取得本机持久化回执':r.anchor_status==='integrity_failed'?'回执完整性检查失败':'回执待持久化'} · 描述性记录</p><p className="mt-2 text-text-dim">{r.payload.securities.map((s:any)=>s.ticker).join('、')} · 窗口 {r.payload.windows.map((w:any)=>w.trading_sessions).join(' / ')} 个交易日 · 尚无收益结果</p><p className="mt-2 break-all text-xs text-text-dim">冻结时间 {r.payload.frozen_at} · 摘要 {r.payload_hash}</p></>}
      </article>)}
    </section>}
  </div>;
}
