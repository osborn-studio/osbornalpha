'use client';
// Stated values with third-party judgment/assumption labels (F4 §12.3, spec §9.3).
import {useTranslations} from 'next-intl';
import type {FieldName} from '@/lib/broker-research/public-types';
import type {PublicReportDetailDto,PublicTargetDto} from '@/lib/broker-research/public-types';
import {InstitutionMark} from './ResearchShell';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import type {DrawerSubject} from './SourceDrawer';
import {citationFor,fmtNum,fmtPct,snippetsFor} from './format';
import {CARD,EN,H2,SRC_BTN,TAG,TD,TH} from './ui';
export function FactsSection({report,target,onOpen}:{report:PublicReportDetailDto;target:PublicTargetDto;onOpen:(s:DrawerSubject)=>void}){
 const t=useTranslations('foreign-research.public.facts'),tf=useTranslations('foreign-research.fields');
 const open=(field:FieldName,label:string,value:string,judgment:boolean)=>()=>{const citation=citationFor(report.citations,target.targetKey,field);onOpen({label,targetKey:target.targetKey,value,citation,snippets:snippetsFor(report.snippets,citation),judgment});};
 const rows:{key:string;label:string;value:React.ReactNode;kind:string}[]=[];
 rows.push({key:'rating',label:t('rows.rating'),kind:t('kind.judgment'),value:<>{target.rating.raw?<><button type="button" className={SRC_BTN} onClick={open('rating',t('rows.rating'),target.rating.raw,true)}>{target.rating.raw}</button> → </>:null}<RatingBadge value={target.rating.normalized} raw={target.rating.raw}/></>});
 const targetText=target.target?`${fmtNum(target.target.price)} ${target.target.currency??''}`.trim():'';
 rows.push({key:'target',label:t('rows.target'),kind:t('kind.judgment'),value:!report.targetPricePublic?<TargetValue target={null} targetPricePublic={false}/>:target.target?<TargetValue target={target.target} targetPricePublic onOpen={open('target_price',t('rows.target'),targetText,true)}/>:<span>{t('absentTarget')}</span>});
 if(target.priceAtReport){const v=`${fmtNum(target.priceAtReport.value)} ${target.priceAtReport.currency??''}`.trim();rows.push({key:'price',label:t('rows.priceAtReport'),kind:t('kind.assumption'),value:<><button type="button" className={SRC_BTN} onClick={open('price_at_report',t('rows.priceAtReport'),v,false)}>{v}</button> · {target.priceAtReport.asOf??'—'}</>});}
 if(report.targetPricePublic&&target.upsidePct!==null)rows.push({key:'upside',label:t('rows.upside'),kind:t('kind.derivedJudgment',{version:target.upsideFormulaVersion??'—'}),value:<span className="font-mono">{fmtPct(target.upsidePct,{signed:true})}</span>});
 for(const field of ['valuation_method','wacc','terminal_growth','terminal_value_share'] as const){const c=citationFor(report.citations,target.targetKey,field);if(!c||c.status==='absent')continue;const v=field==='valuation_method'?c.valueText:fmtPct(c.valueNum);rows.push({key:field,label:tf(field),kind:t('kind.assumption'),value:<button type="button" className={SRC_BTN} onClick={open(field,tf(field),v,false)}>{v}</button>});}
 return <section className={CARD}><h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn')}</span></h2><p className="text-xs text-text-dim">{t('hint')}</p><div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm"><thead><tr>{(['field','value','kind'] as const).map(k=><th key={k} scope="col" className={TH}>{t(`columns.${k}`)}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.key} className="border-t border-border"><td className={TD}>{r.label}</td><td className={TD}>{r.value}</td><td className={TD}><span className={TAG}>{['rating','target','upside'].includes(r.key)?<><InstitutionMark institution={report.institution?.nameEn??'—'}/> {r.kind}</>:r.kind}</span></td></tr>)}</tbody></table></div><dl className="sm:hidden">{rows.map(r=><div key={r.key} className="grid grid-cols-2 gap-2 border-t border-border py-2 text-sm"><dt>{r.label}<span className={TAG}>{['rating','target','upside'].includes(r.key)?<><InstitutionMark institution={report.institution?.nameEn??'—'}/> {r.kind}</>:r.kind}</span></dt><dd className="text-right">{r.value}</dd></div>)}</dl><p className="mt-2 text-xs text-text-muted">{t('noLatestPrice')}</p></section>;
}
