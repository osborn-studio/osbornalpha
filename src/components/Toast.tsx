'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ToastCtx {
  show: (msg: string, ms?: number) => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {} });

export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);

  const show = useCallback((m: string, ms = 2200) => {
    setMsg(m);
    setTimeout(() => setMsg(null), ms);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {msg && (
        <div
          className="fixed bottom-20 left-1/2 z-[2000] -translate-x-1/2 rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-sm shadow-lg"
          role="status"
        >
          {msg}
        </div>
      )}
    </Ctx.Provider>
  );
}
