'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

interface ToolCall { name: string; args: unknown; ok?: boolean; summary?: string; }
interface Verdict {
  ticker?: string; name?: string; rating?: string; thesis?: string;
  positionPct?: number; stop?: string; compliance?: string;
  confidence?: { score: number; n: number; note: string };
}

export function CopilotClient({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState('');
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [err, setErr] = useState('');
  const startedRef = useRef(false);

  const run = useCallback(async (t: string) => {
    if (!t || running) return;
    setRunning(true); setText(''); setCalls([]); setVerdict(null); setErr('');
    const resp = await fetch('/api/copilot', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticker: t }),
    });
    if (!resp.body) { setErr('无响应流'); setRunning(false); return; }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.replace(/^data: /, '').trim();
        if (!line) continue;
        let e: any; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'token') setText((s) => s + e.text);
        else if (e.type === 'tool_call') setCalls((c) => [...c, { name: e.name, args: e.args }]);
        else if (e.type === 'tool_result') setCalls((c) => {
          const u = [...c];
          for (let i = u.length - 1; i >= 0; i--) {
            if (u[i].name === e.name && u[i].ok === undefined) { u[i] = { ...u[i], ok: e.ok, summary: e.summary }; break; }
          }
          return u;
        });
        else if (e.type === 'verdict') setVerdict(e.data);
        else if (e.type === 'error') setErr(e.message);
      }
    }
    setRunning(false);
  }, [running]);

  useEffect(() => {
    if (initialTicker && !startedRef.current) { startedRef.current = true; run(initialTicker); }
  }, [initialTicker, run]);

  return (
    <div className="space-y-3">
      <div className="card-base flex gap-2">
        <input value={ticker} onChange={(e) => setTicker(e.target.value)}
          placeholder="输入代码，如 00700.HK / 600519.SH / NVDA"
          className="flex-1 rounded-md bg-bg-card px-3 py-2 text-sm" />
        <button onClick={() => run(ticker)} disabled={running || !ticker}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {running ? '分析中…' : '让 John 分析'}
        </button>
      </div>

      {err && <div className="card-base text-sm text-down">⚠️ {err}</div>}

      {(text || calls.length > 0) && (
        <div className="card-base">
          <div className="mb-2 text-sm font-semibold text-text-dim">🪜 推理过程</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
          {calls.length > 0 && (
            <div className="mt-3 space-y-1">
              {calls.map((c, i) => (
                <details key={i} className="rounded bg-bg-card px-2 py-1 text-xs">
                  <summary className="cursor-pointer">
                    {c.ok === undefined ? '⏳' : c.ok ? '✅' : '❌'} 工具 <b>{c.name}</b>
                    {c.summary ? ` — ${c.summary}` : ''}
                  </summary>
                  <pre className="mt-1 overflow-auto text-[11px] text-text-muted">{JSON.stringify(c.args, null, 2)}</pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {verdict && (
        <div className="card-base border border-accent-dim">
          <div className="mb-1 text-sm font-semibold">📌 结论 · {verdict.name ?? verdict.ticker}</div>
          <div className="text-lg font-bold text-accent">{verdict.rating}</div>
          {verdict.thesis && <div className="mt-2 whitespace-pre-wrap text-sm">{verdict.thesis}</div>}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {verdict.positionPct != null && <div>仓位：<b>{verdict.positionPct}%</b></div>}
            {verdict.stop && <div>止损：{verdict.stop}</div>}
          </div>
          {verdict.confidence && <div className="mt-1 text-xs text-text-dim">置信 {verdict.confidence.score}（n={verdict.confidence.n}）{verdict.confidence.note}</div>}
          {verdict.compliance && <div className="mt-2 text-[11px] text-text-muted">{verdict.compliance}</div>}
        </div>
      )}
    </div>
  );
}
