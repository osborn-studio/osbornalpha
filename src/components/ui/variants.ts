// Pure class builders for the ui primitives. Kept free of React so the
// repo's node-env vitest can unit-test them. Colors come from the V1/V2
// CSS vars; density-aware spacing comes from the V3 vars (globals.css).

import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-black hover:bg-[var(--accent-dim)]',
  secondary:
    'bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--bg-hover)]',
  danger:
    'bg-transparent text-[var(--down)] border border-[var(--down)] hover:bg-[var(--down)]/10',
  ghost: 'bg-transparent text-[var(--text-dim)] hover:text-[var(--text)]',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-1.5 text-sm',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], extra);
}

export type TagTone = 'up' | 'down' | 'accent' | 'neutral';

const TAG_TONES: Record<TagTone, string> = {
  up: 'text-[var(--up)] border-[var(--up)]/40',
  down: 'text-[var(--down)] border-[var(--down)]/40',
  accent: 'text-[var(--accent)] border-[var(--accent)]/40',
  neutral: 'text-[var(--text-dim)] border-[var(--border)]',
};

export function tagClasses(tone: TagTone = 'neutral', extra?: string) {
  return cn(
    'inline-flex items-center rounded px-1.5 py-0.5 border bg-transparent',
    'text-[length:var(--label-size)] leading-tight',
    TAG_TONES[tone],
    extra,
  );
}

export function metricTrendClass(change: number): string {
  if (change > 0) return 'text-[var(--up)]';
  if (change < 0) return 'text-[var(--down)]';
  return 'text-[var(--text-dim)]';
}
