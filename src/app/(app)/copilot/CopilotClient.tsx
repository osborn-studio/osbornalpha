'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { classifyMarket } from '@/lib/utils';

const HISTORY_KEY = 'osbornalpha:copilot:history:v1';
const HISTORY_MAX = 20;

interface ToolCall { name: string; args: unknown; ok?: boolean; summary?: string; }
interface Verdict {
  ticker?: string; name?: string; rating?: string; thesis?: string;
  positionPct?: number; stop?: string; compliance?: string;
  confidence?: { score: number; n: number; note: string } | number;
  // hiphon-pm-deepdive verdict shape (see skills/hiphon-pm-deepdive/SKILL.md derived method):
  position_pct?: number; entry_low?: number; entry_high?: number; stop_loss?: number; summary?: string;
}
interface HistoryEntry { ticker: string; rating: string; positionPct?: number; at: string; }

// Loosely map a free-text/verdict rating into the decisions table's action enum.
function mapRatingToAction(rating: string | undefined): 'buy' | 'hold' | 'sell' {
  const r = (rating ?? '').toLowerCase();
  if (/买|buy|bull/.test(r)) return 'buy';
  if (/卖|sell|bear|reduce|trim/.test(r)) return 'sell';
  return 'hold';
}

export function CopilotClient({ initialTicker = '', initialQuestion = '', autoStart = true, methodId }: { initialTicker?: string; initialQuestion?: string; autoStart?: boolean; methodId?: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState('');
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [adopting, setAdopting] = useState(false);
  const [adopted, setAdopted] = useState<string>('');
  const startedRef = useRef(false);

  // Load persisted run-history on mount (SSR-safe).
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setHistory(parsed.slice(0, HISTORY_MAX) as HistoryEntry[]);
      }
    } catch { /* ignore: malformed or unavailable storage */ }
  }, []);

  const appendHistory = useCallback((v: Verdict) => {
    if (!v || !v.ticker || !v.rating) return;
    const entry: HistoryEntry = {
      ticker: v.ticker,
      rating: v.rating,
      positionPct: v.positionPct,
      at: new Date().toISOString(),
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_MAX);
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        }
      } catch { /* ignore: storage quota or unavailable */ }
      return next;
    });
  }, []);

  const run = useCallback(async (t: string, q?: string) => {
    if ((!t && !q) || running) return;
    setRunning(true); setText(''); setCalls([]); setVerdict(null); setErr(''); setAdopted(''); setAdopting(false);
    const resp = await fetch('/api/copilot', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticker: t || undefined, question: q, methodId }),
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
        else if (e.type === 'verdict') { setVerdict(e.data); appendHistory(e.data); }
        else if (e.type === 'error') setErr(e.message);
      }
    }
    setRunning(false);
  }, [running, appendHistory]);

  useEffect(() => {
    // A wizard hand-off (?q=…, optionally with ?method=) should fire immediately,
    // same as the existing ?ticker= autoStart — the whole point of landing here
    // from /intel is to run right away.
    if (autoStart && (initialTicker || initialQuestion) && !startedRef.current) {
      startedRef.current = true;
      run(initialTicker, initialQuestion || undefined);
    }
  }, [autoStart, initialTicker, initialQuestion, run]);

  const adoptVerdict = useCallback(async () => {
    if (!verdict || adopting) return;
    setAdopting(true); setAdopted('');
    const t = verdict.ticker || ticker;
    try {
      const resp = await fetch('/api/decisions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticker: t,
          market: classifyMarket(t),
          action: mapRatingToAction(verdict.rating),
          thesis: (verdict.summary ?? verdict.thesis ?? '').slice(0, 200),
          confidence: typeof verdict.confidence === 'number' ? verdict.confidence : verdict.confidence?.score,
          target_price: verdict.entry_high,
          stop_loss: typeof verdict.stop_loss === 'number' ? verdict.stop_loss : undefined,
          entry_low: verdict.entry_low,
          entry_high: verdict.entry_high,
          source_type: 'copilot',
          source_ref: { method: methodId, run_at: new Date().toISOString() },
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setAdopted(`error:${body.error ?? resp.statusText}`);
      } else {
        setAdopted('ok');
      }
    } catch (e) {
      setAdopted(`error:${String(e)}`);
    } finally {
      setAdopting(false);
    }
  }, [verdict, ticker, methodId, adopting]);

  return (
    <div className="space-y-3">
      {history.length > 0 && (
        <div className="card-base">
          <div className="mb-2 text-xs font-semibold text-text-dim">🕘 最近分析</div>
          <div className="flex flex-wrap gap-1">
            {history.map((h, i) => (
              <button
                key={`${h.ticker}-${h.at}-${i}`}
                type="button"
                onClick={() => run(h.ticker)}
                disabled={running}
                className="rounded bg-bg-card px-2 py-1 text-xs disabled:opacity-50"
              >
                {h.ticker} · {h.rating}
              </button>
            ))}
          </div>
        </div>
      )}

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
          {verdict.confidence != null && (
            <div className="mt-1 text-xs text-text-dim">
              {typeof verdict.confidence === 'number'
                ? `置信 ${verdict.confidence}`
                : `置信 ${verdict.confidence.score}（n=${verdict.confidence.n}）${verdict.confidence.note}`}
            </div>
          )}
          {verdict.compliance && <div className="mt-2 text-[11px] text-text-muted">{verdict.compliance}</div>}

          {/* Wizard verdicts (bottleneck/industry-chain) carry no single actionable
              ticker — hide the adopt CTA instead of offering a dead-end 400. */}
          {(verdict.ticker || ticker) ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={adoptVerdict}
                disabled={adopting || adopted === 'ok'}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {adopting ? '记录中…' : '✅ 采纳 → 记录决策'}
              </button>
              {adopted === 'ok' && <span className="text-xs text-up">已记录 ✓</span>}
              {adopted.startsWith('error:') && <span className="text-xs text-down">{adopted.slice(6)}</span>}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
