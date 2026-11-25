/**
 * Shared evidence source drawer: "Drawer" / "M-Drawer" in the unified research canvas (2026-11-17).
 * Six fixed sections: identity, source, times, transform, licence and links.
 * Variants: ok, revised, withheld and retracted; restricted variants expose identity only.
 * Modules own fetching and supply display-ready data, pending/failed states and slots.
 */
'use client';
import {useEffect, useRef, useState, type ReactNode, type KeyboardEvent} from 'react';
import {useTranslations} from 'next-intl';
import {MarkTag} from '../MarkTag';
import {StateBadge} from '../StateBadge';
import {drawerHeader, drawerRevised, drawerSections} from './model';
import type {DrawerSectionId, DrawerText, SourceDrawerInput} from './types';

export interface SourceDrawerProps {
  input: SourceDrawerInput | null;
  onClose: () => void;
  text?: DrawerText;
  pending?: readonly DrawerSectionId[];
  failed?: readonly DrawerSectionId[];
  failedText?: string;
  slots?: Partial<Record<DrawerSectionId, ReactNode>>;
}
const identityText: DrawerText = key => key;
const mono = 'font-mono tabular-nums';
const caption = 'text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim';
const warning = 'rounded border border-warn p-2 text-xs';
const button = 'inline-flex items-center justify-center rounded border border-border px-3 py-2 text-xs';

function externalLinkProps(href: string, newTab = false) {
  return (newTab || /^https?:\/\//.test(href)) ? {target: '_blank', rel: 'noopener noreferrer'} : {};
}

export function SourceDrawerShell({title,mark,kind,onClose,children,footer}:{
  title:string;mark:'fact'|'judgment';kind?:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;
}) {
  const t=useTranslations('research.drawer');
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'))
      .filter(item => item.getClientRects().length > 0);
    const first = items[0], last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {event.preventDefault(); last.focus();}
    else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) {event.preventDefault(); first.focus();}
  }
  return <div className="fixed inset-0 z-[60] flex sm:justify-end" onKeyDown={onKeyDown}>
    <div aria-hidden="true" className="absolute inset-0 bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]" onClick={onClose} />
    <div ref={panel} role="dialog" aria-modal="true" data-drawer-kind={kind} aria-label={`${t('title')} · ${title}`} className="relative flex h-[100dvh] w-full flex-col border-l border-border bg-bg-elevated sm:h-full sm:w-[min(520px,100vw)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:justify-end">
        <button ref={closeButton} type="button" onClick={onClose} aria-label={t('close')} className="flex h-11 w-11 items-center justify-center rounded text-text-dim hover:bg-[var(--accent-wash)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <span className="text-sm sm:hidden">{t('title')}</span>
        <span className="ml-auto sm:hidden"><MarkTag kind={mark} /></span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
      {footer}
    </div>
  </div>;
}

export function SourceDrawer({input, onClose, text = identityText, pending = [], failed = [], failedText, slots}: SourceDrawerProps) {
  const t = useTranslations('research.drawer');
  const [copied, setCopied] = useState<string | null>(null);
  const open = input !== null;
  useEffect(() => { if(open)setCopied(null); }, [open]);
  if (!input) return null;
  const header = drawerHeader(input);
  const exposed = input.variant === 'ok' || input.variant === 'revised' ? input : null;
  const kind = exposed ? exposed.payload.kind : (input as Extract<SourceDrawerInput, {variant: 'withheld' | 'retracted'}>).kind;
  const sha = exposed?.payload.source.evidence_sha256;
  const revisions = exposed?.extras?.revisions;
  const revised = drawerRevised(input);
  async function copyHash() {
    if (!sha || !navigator.clipboard?.writeText) return;
    try { await navigator.clipboard.writeText(sha); setCopied(sha); } catch { /* Keep the copy action available after a denied clipboard write. */ }
  }
  const copyLabel = (mobile: boolean) => copied === sha ? t('copied') : t(mobile ? 'copyHash' : 'copy');
  return <SourceDrawerShell title={header.title} mark={header.mark} onClose={onClose} footer={exposed && <div className="sticky bottom-0 flex gap-2 border-t border-border bg-bg-elevated px-3.5 py-2.5 sm:hidden">
        <a href={exposed.payload.links.module_href} className={`${button} min-h-[44px] flex-1 bg-accent font-semibold text-bg`}>{t(`links.module.${kind}`)}</a>
        {sha && <button type="button" onClick={copyHash} className={`${button} min-h-[44px]`}>{copyLabel(true)}</button>}
      </div>}>
        <header className="space-y-2 px-4 py-3">
          <div className={caption}>{t('title')} · {t(`kinds.${kind}`)} <span className={mono}>{kind}</span></div>
          <h2 className="break-words text-base font-semibold">{header.title}{header.value !== null && <> <span className={mono}>{header.value}</span></>}{header.period !== null && <> <span className={`${mono} text-xs font-normal text-text-dim`}>{header.period}</span></>}</h2>
          <div className="flex flex-wrap gap-2"><span className="hidden sm:inline-flex"><MarkTag kind={header.mark} /></span>{header.states.map(state => <StateBadge key={state} state={state} />)}</div>
        </header>
        {drawerSections(input, t, text).map((section, index, sections) => {
          const isPending = pending.includes(section.id);
          const isFailed = failed.includes(section.id);
          const incomplete = isPending || isFailed;
          const rows = incomplete ? section.rows.filter(row => row.value !== null && row.value !== '') : section.rows;
          const showFailure = isFailed && !sections.slice(0, index).some(previous => failed.includes(previous.id));
          if (isFailed && !showFailure && rows.length === 0) return null;
          return <section key={section.id} data-drawer-section={section.id} className={`space-y-2 border-t border-border px-4 py-3 ${section.id === 'links' && !section.rows.some(row => row.key !== 'module' && row.href) ? 'hidden sm:block' : ''}`}>
          <h3 className={caption}><span className={mono}>{section.no}</span>{` · ${t(`sections.${section.id}`)}`}</h3>
          <>
            {section.id === 'links' ? <div className="flex flex-wrap gap-2">
              {rows.map(row => row.href && <a key={row.key} href={row.href} {...(row.key === 'module' ? {} : externalLinkProps(row.href, row.newTab || row.key === 'sha256'))} className={`${row.key === 'module' ? 'hidden sm:inline-flex' : 'inline-flex'} min-h-[32px] items-center justify-center rounded border border-border px-3 py-2 text-xs`}>{row.value}</a>)}
            </div> : <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-[5px] text-xs sm:grid-cols-[128px_minmax(0,1fr)]">
              {rows.map(row => <div key={row.key} className="contents">
                <dt className="text-text-dim">{row.label}</dt>
                <dd className={`break-words text-text ${row.mono ? mono : ''}`}>
                  {row.value === null ? <StateBadge state="missing" /> : <>
                    {row.href ? <a href={row.href} {...(row.key === 'module' ? {} : externalLinkProps(row.href, row.newTab || row.key === 'sha256'))} className="underline decoration-dotted">{row.value}</a> : row.value}
                    {row.state && <> <StateBadge state={row.state} /></>}
                    {row.copy && sha && <button type="button" onClick={copyHash} className={`${button} ml-2 hidden sm:inline-flex`}>{copyLabel(false)}</button>}
                  </>}
                  {input.variant === 'withheld' && row.key === 'reason' && <div className={`${mono} text-text-dim`}>{input.reason.code}</div>}
                </dd>
              </div>)}
            </dl>}
            {!incomplete && section.id === 'times' && revisions && revisions.length > 0 && <table className="w-full text-xs">
              <thead><tr>{(['period','value','available','version'] as const).map(key => <th key={key} className={`px-1.5 py-1 font-medium text-text-dim ${key === 'period' ? 'pl-0' : ''} ${key === 'value' ? 'text-right' : 'text-left'}`}>{t(`revisions.${key}`)}</th>)}</tr></thead>
              <tbody>{revisions.map((revision, i) => <tr key={`${revision.version}-${i}`} aria-current={revision.current ? 'true' : undefined} className={`border-t border-border ${revision.current ? '' : 'text-text-dim'}`}>
                <td className={`${mono} px-1.5 pl-0 py-1`}>{revision.period}</td><td className={`${mono} px-1.5 py-1 text-right`}>{revision.value}</td><td className={`${mono} px-1.5 py-1`}>{revision.available}</td><td className={`${mono} px-1.5 py-1`}>{revision.version}</td>
              </tr>)}</tbody>
            </table>}
            {!incomplete && section.id === 'times' && revised && <><table className="w-full text-xs"><tbody>{(['frozen','current'] as const).map(key => <tr key={key} className="border-t border-border"><th scope="row" className="px-1.5 pl-0 py-1 text-left font-medium">{t(`revised.${key}`)}</th><td className={`${mono} px-1.5 text-right`}>{revised[key].value}</td><td className={`${mono} px-1.5 text-text-dim`}>{revised[key].available_at}</td></tr>)}</tbody></table><p className={warning}>{t('revised.note')}</p></>}
            {!incomplete && slots?.[section.id]}
            {isPending && <div role="status" aria-busy="true" className="space-y-2">
              <span className="sr-only">{t('loadingLabel')}</span>
              <div className="h-3 w-[60%] rounded-[3px] bg-bg-card" /><div className="h-3 w-[90%] rounded-[3px] bg-bg-card" /><div className="h-3 w-[75%] rounded-[3px] bg-bg-card" />
            </div>}
            {showFailure && <p role="alert" className={warning}>{failedText ?? t('loadFailed')}</p>}
          </>
        </section>;})}
        {input.variant === 'withheld' && <p className="mx-4 my-3 rounded border border-border p-2 text-xs text-text-dim">{t('withheldNote')}</p>}
        {input.variant === 'retracted' && <p className="mx-4 my-3 rounded border border-danger p-2 text-xs">{t('retractedNote')}</p>}
  </SourceDrawerShell>;
}
