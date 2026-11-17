// Shared token-only classes for public foreign research surfaces (spec §9).
export const CARD='rounded-lg border border-border bg-bg-card p-4';
export const CARD_FLUSH='rounded-lg border border-border bg-bg-card';
export const CHIP='inline-flex items-center whitespace-nowrap rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-dim';
export const TAG='inline-flex items-center whitespace-nowrap rounded border border-border px-1.5 py-0.5 text-[10px] text-text-dim';
export const SRC_BTN='font-mono tabular-nums text-text underline decoration-dotted underline-offset-4 hover:text-accent';
export const CALLOUT='rounded-md border border-border bg-bg-elevated p-6 text-sm text-text-dim';
export const BTN='inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-bg-elevated px-3 text-xs text-text';
export const INPUT='min-h-9 rounded-md border border-border bg-bg-card px-2.5 text-sm text-text';
export const TH='px-2 py-2 text-left text-xs font-medium text-text-dim';
export const TD='px-2 py-2 align-top';
export const H1='text-xl font-semibold sm:text-2xl';
export const H2='text-base font-semibold';
export const EN='ml-2 text-xs font-normal text-text-muted';
export const TINY='text-[11px] text-text-muted';
export const SEG='inline-flex rounded-md border border-border p-0.5';
export const segBtn=(on:boolean)=>`min-h-8 rounded px-2.5 text-xs ${on?'bg-[var(--accent-wash)] text-accent':'text-text-dim hover:text-text'}`;
