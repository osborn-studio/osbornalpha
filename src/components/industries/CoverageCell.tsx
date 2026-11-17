import {useLocale,useTranslations} from 'next-intl';
import {StateCell} from '@/components/research-ui';
import type {AggMetric} from '@/lib/industry/types-us';
import {cellPresentation,type DisplayCell,type Translate} from './cell-text';
export function CoverageCell({cell,metric,compactOnMobile=false}:{cell:DisplayCell|null;metric:AggMetric;compactOnMobile?:boolean}){
 const t=useTranslations('industries');
 const locale=useLocale()==='en'?'en':'zh';
 const p=cellPresentation(cell,metric,locale,t as Translate);
 return p.state?<span className="min-w-0 break-words [&_[data-research-state]]:h-auto [&_[data-research-state]]:min-h-5 [&_[data-research-state]]:whitespace-normal">{compactOnMobile?<><span className="sm:hidden"><StateCell state={p.state}/></span><span className="hidden sm:inline"><StateCell state={p.state} detail={p.detail}/></span></>:<StateCell state={p.state} detail={p.detail}/>}</span>:<span className="font-mono tabular-nums">{p.value}</span>;
}
