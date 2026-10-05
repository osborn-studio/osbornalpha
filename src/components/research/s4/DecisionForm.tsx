'use client';
import {useRef,useState} from 'react';
export interface OptionsView {securities:Array<{ticker:string;name:string;synthetic:boolean|null}>;companies:Array<{id:string;name:string}>}
const actions=[['research','研究'],['observe','观察'],['adopt','采纳'],['reject','拒绝'],['defer','延期'],['refute','证伪']];
export function DecisionForm({options,revision,onSubmit,busy,blocked=false,lockDraft=false}:{options:OptionsView;revision:number;onSubmit:(input:Record<string,unknown>)=>Promise<void>;busy:boolean;blocked?:boolean;lockDraft?:boolean}) {
  const [action,setAction]=useState('observe'),[reason,setReason]=useState(''),[security,setSecurity]=useState(''),[company,setCompany]=useState('');
  const [newObservation,setNewObservation]=useState(false),[reviewAt,setReviewAt]=useState('');
  const attempt=useRef({signature:'',key:''});
  async function submit(e:React.FormEvent){e.preventDefault();if(blocked)return;
    const body={action,reason,expectedRevision:revision,securityTicker:security||null,companyEntityId:company||null,
      newObservation,reviewAt:reviewAt?new Date(reviewAt).toISOString():null};
    const signature=JSON.stringify(body);if(attempt.current.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};
    await onSubmit({...body,requestKey:attempt.current.key});
  }
  return <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-bg-card p-4" aria-label="记录决定">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">记录决定</h2><span className="text-xs text-text-dim">{blocked?'请重新查看材料后提交':`当前版本 ${revision}`}</span></div>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm">决定<select aria-label="决定" className="mt-1 w-full rounded border border-border bg-bg p-2" value={action} onChange={e=>setAction(e.target.value)} disabled={busy||lockDraft}>
        {actions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">观察证券<select aria-label="观察证券" className="mt-1 w-full rounded border border-border bg-bg p-2" value={security} onChange={e=>setSecurity(e.target.value)} disabled={busy||lockDraft}>
        <option value="">请选择 · 新观察必须明确证券</option>{options.securities.map(s=><option key={s.ticker} value={s.ticker}>{s.ticker} · {s.name}{s.synthetic?'（合成）':''}</option>)}</select></label>
      <label className="text-sm">公司对照<select aria-label="公司对照" className="mt-1 w-full rounded border border-border bg-bg p-2" value={company} onChange={e=>setCompany(e.target.value)} disabled={busy||lockDraft}>
        <option value="">未解决 / 探索候选</option>{options.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="text-sm">下次复核时间（可选）<input aria-label="下次复核时间" type="datetime-local" className="mt-1 w-full rounded border border-border bg-bg p-2" value={reviewAt} onChange={e=>setReviewAt(e.target.value)} disabled={busy||lockDraft}/></label>
    </div>
    <label className="block text-sm">理由与待核实问题<textarea aria-label="理由与待核实问题" required maxLength={4000} rows={3} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy||lockDraft} className="mt-1 w-full rounded border border-border bg-bg p-2"/></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={newObservation} onChange={e=>setNewObservation(e.target.checked)} disabled={busy||lockDraft||action==='defer'}/>
      <span>追加一份新观察，保留上一份。首次决定自动登记；延期始终保留原窗口。</span></label>
    <p className="text-xs text-text-dim">无行情时保持等待起点；拒绝记录可作为独立的影子观察。任何决定均不触发交易。</p>
    <button disabled={busy||blocked} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{busy?'正在保存…':'保存决定与观察'}</button>
  </form>;
}
