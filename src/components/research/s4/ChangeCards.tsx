'use client';
export interface CardView {
  id:string;occurrence_count:number;payload:{title:string;synthetic:boolean;recall_reason:string;
    facts:Array<{text:string;span:{start:number;end:number};source_ref:{raw_sha256:string}}>;
    profit_transmission:string;new_advantage:string;valuation_expectations:string;
    counterevidence:string[];inferences:string[];support:string[];related_companies:Array<{id:string;name:string}>;related_securities:string[];next_ten_minutes:string;catalyst:string;invalidation:string;original_event_status:string};
}
export function ChangeCards({cards,selected,onSelect,onCitation}:{cards:CardView[];selected:string;onSelect:(id:string)=>void;onCitation:(id:string,index:number)=>void}) {
  return <section aria-label="本周变化卡" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">本周变化卡</h2>
      <span className="rounded border border-warn px-2 py-1 text-xs text-warn">描述性记录 · 未证明独立判断</span></div>
    {cards.map(card=><article key={card.id} className={`rounded-lg border p-4 ${selected===card.id?'border-accent bg-bg-elevated':'border-border bg-bg-card'}`}>
      <label className="flex items-start gap-3 font-medium"><input type="radio" name="change-card" checked={selected===card.id} onChange={()=>onSelect(card.id)} className="mt-1"/>
        <span>{card.payload.title}<span className="ml-2 text-xs text-text-muted">{card.payload.synthetic?'合成样例 · ':''}{{exploration:'探索',entity_match:'实体关联',random_omission_review:'漏检抽查'}[card.payload.recall_reason]||'待核实'}</span></span></label>
      <p className="mt-2 text-xs text-text-dim">原始事件：未知；{card.occurrence_count} 条导入记录，不等于独立传播证据。</p>
      <h3 className="mt-4 text-sm font-semibold">事实与出处</h3>
      <p className="text-xs text-text-dim">以下为原文摘录，尚未独立核实；不自动视为公司事实。</p>
      <ul className="mt-2 space-y-2">{card.payload.facts.map((fact,i)=><li key={i} className="rounded border border-border p-3 text-sm">
        <p className="whitespace-pre-wrap break-words">{fact.text}</p><button className="mt-2 text-xs text-accent underline" onClick={()=>onCitation(card.id,i)}>查看引用 {i+1}</button>
      </li>)}</ul>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        {[['推断',card.payload.inferences.join('；')||'尚未形成可验证推断'],['支持证据','上方原文摘录；独立性仍待验证'],['相关公司',card.payload.related_companies.map(c=>c.name).join('、')||'未解决'],['相关证券',card.payload.related_securities.join('、')||'未解决，登记时人工对照'],['盈利传导',card.payload.profit_transmission],['新优势',card.payload.new_advantage],['估值预期',card.payload.valuation_expectations],
          ['反证',card.payload.counterevidence.join('；')||'未提供，需主动寻找'],['催化',card.payload.catalyst],['失效条件',card.payload.invalidation]].map(([title,value])=><div key={title}><dt className="text-text-dim">{title}</dt><dd className="mt-1">{value}</dd></div>)}
      </dl>
      <p className="mt-4 rounded bg-bg p-3 text-sm"><strong>下一步十分钟：</strong>{card.payload.next_ten_minutes}</p>
    </article>)}
  </section>;
}
