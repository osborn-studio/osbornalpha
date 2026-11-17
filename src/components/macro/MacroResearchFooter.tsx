'use client';
import Link from 'next/link';
import {ResearchFooter} from '@/components/research-ui/ResearchFooter';
import {registrySources} from './research-sources';
import {useMacroT} from './use-macro-t';
export function MacroResearchFooter({seriesIds,region='US'}:{seriesIds:readonly string[];region?:'US'|'CN'}) {
 const {locale,t}=useMacroT();
 const sources=registrySources(seriesIds,locale);
 const methodsHref=`/macro?region=${region}&tab=methodology`;
 return <div id="macro-sources"><ResearchFooter sources={sources} methodsHref={methodsHref}/>
  {sources.length===0&&<Link href={methodsHref} className="text-xs text-accent">{t('tabs.methodology')}</Link>}
 </div>;
}
