'use client';

// Last-resort boundary: catches errors thrown in the root layout itself.
// Must render its own <html>/<body> because it replaces the root layout.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>应用出错了</h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: '0 0 16px' }}>发生了意外错误。请重试。</p>
          {error.digest && <p style={{ fontSize: 11, opacity: 0.5, fontFamily: 'monospace' }}>错误码 {error.digest}</p>}
          <button
            onClick={reset}
            style={{ marginTop: 8, borderRadius: 8, border: 'none', background: '#2f81f7', color: '#fff', padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
