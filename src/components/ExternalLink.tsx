import type { ReactNode } from 'react';
import { canonicalizeEvidenceUrl } from '@/lib/external-evidence/url';

interface ExternalLinkProps {
  href: string | null | undefined;
  className?: string;
  title?: string;
  children: ReactNode;
}

/** Renders only public http(s) evidence URLs; legacy unsafe records stay text. */
export function ExternalLink({ href, className, title, children }: ExternalLinkProps) {
  const safeHref = href ? canonicalizeEvidenceUrl(href) : null;
  if (!safeHref) return <span className={className} title={title}>{children}</span>;
  return <a href={safeHref} target="_blank" rel="noopener noreferrer" className={className} title={title}>{children}</a>;
}
