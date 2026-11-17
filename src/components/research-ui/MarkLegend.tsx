// Evidence legend; section page headers use it to explain the three mark kinds.
import {useTranslations} from 'next-intl';
import {MarkTag} from './MarkTag';
export function MarkLegend() {
  const t=useTranslations('research');
  return <div role="group" aria-label={t('legend.label')} className="flex flex-wrap items-center gap-1.5">
    <MarkTag kind="fact"/><MarkTag kind="judgment"/><MarkTag kind="hypothesis"/>
  </div>;
}
