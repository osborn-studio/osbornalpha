import {useTranslations} from 'next-intl';

export function OriginTag({derived}:{derived:boolean}){
 const t=useTranslations('industries');
 return <span className="rounded border border-border px-1.5 py-0.5 text-xs text-text-dim">{derived?<>{t('origin.derived')} · <span className="font-mono">yoy/1</span></>:t('origin.vendor')}</span>;
}
