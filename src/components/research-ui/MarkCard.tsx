// Evidence card; section pages pass localized titles and content, with facts unmarked.
import type {ReactNode} from 'react';
import type {MarkKind} from './marks';
import {MarkTag} from './MarkTag';
export interface MarkCardProps {kind:MarkKind;institution?:string;title?:string;children:ReactNode;className?:string}
export function MarkCard({kind,institution,title,children,className=''}:MarkCardProps) {
  const border=kind==='fact'?'border-border':kind==='judgment'?'border-[var(--border-active)]':'border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)]';
  return <section data-mark={kind} className={`rounded-md border ${border} bg-bg-elevated p-4 flex flex-col gap-2.5 min-w-0 ${className}`}>
    {(title || kind!=='fact') && <div className="flex flex-wrap items-center gap-2">
      {kind!=='fact' && <MarkTag kind={kind} institution={institution}/>}
      {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
    </div>}
    {children}
  </section>;
}
