// Evidence tag; section pages use institution for attributed third-party judgments.
import {useTranslations} from 'next-intl';
import type {MarkKind} from './marks';
const styles={
  fact:'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-text',
  judgment:'border-[var(--border-active)] text-accent bg-[var(--accent-wash)]',
  hypothesis:'border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-text-dim',
};
export function MarkTag({kind,institution}:{kind:MarkKind;institution?:string}) {
  const t=useTranslations('research');
  return <span className={`inline-flex items-center h-5 px-[7px] rounded-[4px] text-[10px] font-medium tracking-[0.04em] whitespace-nowrap border ${styles[kind]}`}>
    {kind==='judgment' && institution?t('marks.thirdParty',{institution}):t(`marks.${kind}`)}
  </span>;
}
