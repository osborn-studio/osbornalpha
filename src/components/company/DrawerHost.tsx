// src/components/company/DrawerHost.tsx
'use client';
// Drawer stack of the company page (plan 2026-11-06 Task 12): any view opens a disclosure-history,
// withheld-reason or formula drawer; drawers stack (formula → input history); closing pops the top
// and returns focus to the element that opened it.
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { DerivedCell, WithheldReason } from '@/lib/company/types';
import type { SeriesKey } from './drawer-model';
import { DisclosureDrawer, WithheldDrawer } from './DisclosureDrawer';
import { FormulaDrawer } from './FormulaDrawer';

export type DrawerTarget =
  | { kind: 'history'; key: SeriesKey; duration: string; otherUnits: boolean; scaleExp: number }
  | { kind: 'historyByFact'; factId: string; scaleExp: number }
  | { kind: 'withheld'; reason: WithheldReason; title: string }
  | { kind: 'formula'; metric: string; cell: DerivedCell; periodLabel: string; computedAt: string | null; computedAtKind: 'materialized' | 'live'; basedOnRev: number | null; scaleExp: number };

interface Ctx { open: (t: DrawerTarget) => void }
const DrawerCtx = createContext<Ctx>({ open: () => {} });
export const useDrawers = () => useContext(DrawerCtx);

export function DrawerHost({ ticker, asOf, admin, children }: { ticker: string; asOf: string | null; admin: boolean; children: React.ReactNode }) {
  const [stack, setStack] = useState<DrawerTarget[]>([]);
  const openers = useRef<(HTMLElement | null)[]>([]);
  const open = useCallback((t: DrawerTarget) => {
    openers.current.push(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setStack((s) => [...s, t]);
  }, []);
  const close = useCallback(() => {
    const el = openers.current.pop();
    setStack((s) => s.slice(0, -1));
    requestAnimationFrame(() => el?.focus());
  }, []);
  const top = stack[stack.length - 1];
  return (
    <DrawerCtx.Provider value={{ open }}>
      {children}
      {top?.kind === 'history' && <DisclosureDrawer ticker={ticker} asOf={asOf} admin={admin} target={top} onClose={close} />}
      {top?.kind === 'historyByFact' && <DisclosureDrawer ticker={ticker} asOf={asOf} admin={admin} target={top} onClose={close} />}
      {top?.kind === 'withheld' && <WithheldDrawer reason={top.reason} title={top.title} onClose={close} />}
      {top?.kind === 'formula' && <FormulaDrawer asOf={asOf} target={top} onClose={close} onOpenInput={(factId) => open({ kind: 'historyByFact', factId, scaleExp: top.scaleExp })} />}
    </DrawerCtx.Provider>
  );
}
