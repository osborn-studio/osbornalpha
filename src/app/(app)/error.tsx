'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Error boundary for the protected (app) route group. Catches render/runtime
// errors in any workbench page so users see a recoverable message instead of a
// raw crash. `reset()` re-renders the segment.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] route error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mb-3 text-4xl">⚠️</div>
      <h1 className="mb-2 text-lg font-bold">出错了</h1>
      <p className="mb-1 text-sm text-text-dim">页面加载时遇到问题，已记录。你可以重试或返回首页。</p>
      {error.digest && (
        <p className="mb-4 font-mono text-[11px] text-text-muted">错误码 {error.digest}</p>
      )}
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          重试
        </button>
        <Link
          href="/dashboard"
          className="rounded-md bg-bg-card px-4 py-2 text-sm text-text-dim hover:text-text"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
