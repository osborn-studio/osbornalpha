// src/components/company/DrawerHost.tsx
'use client';
// Drawer stack of the company page (plan 2026-11-06 Task 12 + review fixes): any view opens a
// disclosure-history, withheld-reason or formula drawer; drawers stack (formula → input history) and ALL stay
// mounted (state survives) while only the top is interactive; closing pops the top and returns focus to the
// exact element that opened it. While any drawer is open the page behind is inert and body scroll is locked.
import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import type { DerivedCell, WithheldReason } from '@/lib/company/types';
import type { SeriesKey } from './drawer-model';
import { DisclosureDrawer, WithheldDrawer } from './DisclosureDrawer';
import { FormulaDrawer } from './FormulaDrawer';
import { emptyStack, isInteractive, stackReducer } from './drawer-stack';

export type DrawerTarget =
  | { kind: 'history'; key: SeriesKey; duration: string; otherUnits: boolean; scaleExp: number }
  | { kind: 'historyByFact'; factId: string; scaleExp: number }
  | { kind: 'withheld'; reason: WithheldReason; title: string }
  | { kind: 'formula'; metric: string; cell: DerivedCell; periodLabel: string; computedAt: string | null; computedAtKind: 'materialized' | 'live'; basedOnRev: number | null; scaleExp: number };

interface Ctx { open: (t: DrawerTarget) => void }
const DrawerCtx = createContext<Ctx>({ open: () => {} });
export const useDrawers = () => useContext(DrawerCtx);

export function DrawerHost({ ticker, asOf, admin, children }: { ticker: string; asOf: string | null; admin: boolean; children: React.ReactNode }) {
  const [stack, dispatch] = useReducer(stackReducer<DrawerTarget>, undefined, emptyStack<DrawerTarget>);
  const openers = useRef(new Map<number, HTMLElement | null>());
  const nextId = useRef(1);
  const open = useCallback((t: DrawerTarget) => {
    openers.current.set(nextId.current++, document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dispatch({ type: 'open', target: t });
  }, []);
  const close = useCallback(() => dispatch({ type: 'close' }), []);
  // A drawer opened under one access mode (public / admin) must not survive a switch to the other.
  useEffect(() => { dispatch({ type: 'reset' }); }, [admin]);
  useEffect(() => {
    if (stack.returnFocusTo === null) return;
    const el = openers.current.get(stack.returnFocusTo);
    openers.current.delete(stack.returnFocusTo);
    dispatch({ type: 'focused' });
    if (el && el.isConnected) el.focus();
  }, [stack.returnFocusTo]);
  const anyOpen = stack.entries.length > 0;
  useEffect(() => {
    if (!anyOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [anyOpen]);
  return (
    <DrawerCtx.Provider value={{ open }}>
      <div inert={anyOpen}>{children}</div>
      {stack.entries.map(({ id, target }) => {
        const live = isInteractive(stack, id);
        return (
          <div key={id} inert={!live} aria-hidden={!live || undefined}>
            {target.kind === 'history' || target.kind === 'historyByFact'
              ? <DisclosureDrawer ticker={ticker} asOf={asOf} admin={admin} target={target} onClose={close} />
              : target.kind === 'withheld'
                ? <WithheldDrawer reason={target.reason} title={target.title} onClose={close} />
                : <FormulaDrawer asOf={asOf} target={target} onClose={close} onOpenInput={(factId) => open({ kind: 'historyByFact', factId, scaleExp: target.scaleExp })} />}
          </div>
        );
      })}
    </DrawerCtx.Provider>
  );
}
