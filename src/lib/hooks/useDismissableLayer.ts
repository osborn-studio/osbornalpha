'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface DismissableLayerOptions {
  focusOnOpen?: boolean;
  restoreFocus?: boolean;
}

export function useDismissableLayer(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
  options: DismissableLayerOptions = {},
) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = options.focusOnOpen ? window.requestAnimationFrame(() => {
      const target = ref.current?.querySelector<HTMLElement>(
        '[data-dismissable-layer-autofocus], [data-dismissable-layer-content] input:not(:disabled), [data-dismissable-layer-content] button:not(:disabled), [data-dismissable-layer-content] select:not(:disabled), [data-dismissable-layer-content] [tabindex]:not([tabindex="-1"])',
      );
      target?.focus();
    }) : null;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismissRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismissRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      if (options.restoreFocus && previouslyFocused?.isConnected) {
        window.requestAnimationFrame(() => previouslyFocused.focus());
      }
    };
  }, [open, options.focusOnOpen, options.restoreFocus, ref]);
}
