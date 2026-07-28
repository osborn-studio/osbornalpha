// Panel.tsx — a Card that flips its subtree into the compact data tier.
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export function Panel({ title, className, children, ...rest }: PanelProps) {
  return (
    <div
      data-density="data"
      className={cn('rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-[var(--panel-pad)]', className)}
      {...rest}
    >
      {title ? (
        <div className="mb-[var(--row-gap)] text-[length:var(--label-size)] uppercase tracking-wider text-[var(--text-dim)]">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}
