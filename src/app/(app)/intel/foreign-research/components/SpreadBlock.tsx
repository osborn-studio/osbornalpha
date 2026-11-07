'use client';
// Same security/currency cross-institution judgments; never current market prices (spec §9.3).
import {useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {PublicSpreadRowDto} from '@/lib/broker-research/public-read';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import {reportHref} from './ReportsTable';
import {useNarrow} from './HistoryBlock';
import {fmtNum,fmtPct,shortId,spreadChart} from './format';
import {CARD,EN,H2,SEG,TAG,TD,TH,segBtn} from './ui';
const BOX={width:1000,height:0,left:200,right:20,top:20,bottom:30};
export function SpreadBlock({rows,securityTicker,currency,windowMonths}:{rows:PublicSpreadRowDto[];securityTicker:string;currency:string|null;windowMonths:number}){
 const t=useTranslations('foreign-research.public.spread'),narrow=useNarrow(),[view,setView]=useState<'chart'|'table'>('table');
 const chart=spreadChart(rows.map(r=>({key:r.reportId,priceAtReport:r.priceAtReport?.value??null,target:r.targetPricePublic?r.target?.price??null:null})),BOX,50);
 return <section className={CARD}><div className="flex flex-wrap items-center gap-2"><h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn')}</span></h2><span className={TAG}>{t('judgment')}</span><span className="text-xs">{t('scope',{ticker:securityTicker,currency:currency??'—',months:windowMonths})}</span>{chart&&!narrow?<div className={SEG} role="group" aria-label={t('viewToggle')}>{(['chart','table'] as const).map(v=><button key={v} type="button" className={segBtn(view===v)} onClick={()=>setView(v)}>{t(v)}</button>)}</div>:null}</div>
 {!rows.length?<p>{t('none')}</p>:view==='chart'&&chart&&!narrow?<svg viewBox={`0 0 ${BOX.width} ${chart.height}`} width="100%" role="img" aria-label={t('chartLabel',{ticker:securityTicker,currency:currency??'—',n:rows.length})}>{chart.rows.map((c,i)=><g key={c.key}><text x={BOX.left-8} y={c.y} textAnchor="end" fill="var(--text-dim)" fontSize="11">{rows[i].institution.nameEn}</text>{c.priceX!==null?<circle cx={c.priceX} cy={c.y} r="5" fill="var(--bg-elevated)" stroke="var(--text-dim)"><title>{fmtNum(rows[i].priceAtReport?.value)}</title></circle>:null}{c.targetX!==null?<circle cx={c.targetX} cy={c.y} r="6" fill="var(--accent)"><title>{fmtNum(rows[i].target?.price)}</title></circle>:<text x={BOX.left} y={c.y+16} fill="var(--text-muted)" fontSize="10">{rows[i].targetPricePublic?t('noTarget'):t('targetHidden')}</text>}</g>)}</svg>:<div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr>{(['institution','report','date','rating','priceAtReport','target','upside'] as const).map(k=><th key={k} scope="col" className={TH}>{t(`columns.${k}`)}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.reportId} className="border-t border-border"><td className={TD}>{r.institution.nameEn}</td><td className={TD}><Link href={reportHref(r.reportId)}>{shortId(r.reportId)}</Link></td><td className={TD}>{r.publishedDate??'—'}</td><td className={TD}><RatingBadge value={r.rating.normalized}/></td><td className={TD}>{fmtNum(r.priceAtReport?.value)}</td><td className={TD}><TargetValue target={r.target} targetPricePublic={r.targetPricePublic}/></td><td className={TD}>{r.targetPricePublic?fmtPct(r.upsidePct,{signed:true}):'—'}</td></tr>)}</tbody></table></div>}</section>;
}
