// SourceFooter — 来源条 (spec §3.2): the publishers behind the verified rows and an "open evidence" button.
import type { MacroT } from './use-macro-t';

export function SourceFooter({ labels, t, onOpen }: { labels: string[]; t: MacroT; onOpen?: () => void }) {
  return (
    <footer aria-label={t('sources.title')} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-[11px] text-text-dim">
      <span className="uppercase tracking-wider">{t('sources.title')}</span>
      {labels.map((l) => <span key={l} className="rounded border border-border px-2 py-0.5">{l}</span>)}
      {onOpen && (
        <button type="button" onClick={onOpen} className="ml-auto rounded border border-border px-3 py-1 text-xs text-text">{t('sources.open')}</button>
      )}
    </footer>
  );
}
