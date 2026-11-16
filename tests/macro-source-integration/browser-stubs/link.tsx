import type { AnchorHTMLAttributes, ReactNode } from 'react';
export default function Link({ href, children, prefetch: _prefetch, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; children?: ReactNode; prefetch?: boolean }) {
  return <a href={href} {...props}>{children}</a>;
}
