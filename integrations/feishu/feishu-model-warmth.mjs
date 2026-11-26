// Ollama's empty chat preloads weights without running generation. Keep a finite lease so stopping the connector releases memory.
export function startFeishuModelWarmth(env, {fetchImpl=fetch,now=Date.now,intervalMs=120_000} = {}) {
  let service;
  const model=env.FEISHU_LLM_MODEL?.trim();
  try { service=new URL(env.FEISHU_LLM_BASE_URL); } catch { /* Other model providers do not have Ollama's preload API. */ }
  if (env.FEISHU_LLM_KEEP_WARM !== 'true' || !service || service.protocol !== 'http:' ||
      !['localhost','127.0.0.1','[::1]'].includes(service.hostname) || service.port !== '11434' ||
      service.pathname.replace(/\/+$/,'') !== '/v1' || service.search || service.hash || service.username || service.password ||
      !model || model.length>200 || /\s/u.test(model)) return () => {};
  const stop = new AbortController();
  let timer;
  async function refresh() {
    const signal=AbortSignal.any([stop.signal,AbortSignal.timeout(40_000)]);
    try {
      const status=await fetchImpl(new URL('/api/ps',service),{signal,redirect:'error'});
      if (!status.ok) { await status.body?.cancel(); return; }
      const loaded=await status.json();
      if (!Array.isArray(loaded?.models)) return;
      const active=loaded.models.find(item=>item?.name===model || item?.model===model);
      if (active && Date.parse(active.expires_at) - now() > 3*60_000) return;
      const result=await fetchImpl(new URL('/api/chat',service),{
        method:'POST',headers:{'Content-Type':'application/json'},signal,redirect:'error',
        body:JSON.stringify({model,stream:false,keep_alive:'8m'}),
      });
      await result.body?.cancel();
    } catch { /* Warmth is optional. The next refresh also covers an Ollama restart or a wake from sleep. */ }
    finally {
      if (!stop.signal.aborted) {
        timer=setTimeout(refresh,intervalMs);
        timer.unref();
      }
    }
  }
  void refresh();
  return () => {stop.abort();clearTimeout(timer);};
}
