const loopback = new Set(['localhost','127.0.0.1','[::1]']);
const rejectionCodes = new Map([
  ['position_conflict','正式系统拒绝模拟成交。请核对目标组合的可卖股数和持仓币种。'],
  ['analyst_unavailable','正式系统未找到该分析师的有效档案。请 PM 核对绑定。'],
  ['owner_mismatch','正式账户与连接器的绑定不一致。请 PM 核对。'],
  ['payload_conflict','正式系统已使用该提案编号。请按编号核对登记结果。'],
]);

export function createFormalSync(env = process.env, {fetchImpl = fetch} = {}) {
  const origin = env.FEISHU_SIMULATION_ORIGIN;
  const token = env.FEISHU_SIMULATION_INGEST_TOKEN;
  if (!origin && !token) return undefined;
  let target;
  try { target = new URL(origin); } catch { throw Error('正式系统接入地址无效。'); }
  if (target.href !== target.origin + '/' ||
      (target.protocol !== 'https:' && !(target.protocol === 'http:' && loopback.has(target.hostname))) || !token) {
    throw Error('正式系统地址或接入配置无效。');
  }
  const url = new URL('/api/integrations/feishu/simulation',target);
  return async payload => {
    const response = await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20_000),
      headers:{authorization:'Bearer ' + token,'content-type':'application/json'},body:JSON.stringify(payload)});
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw Object.assign(Error('正式系统返回 HTTP ' + response.status),{
        status:response.status,retriable:response.status >= 500 || [408,429].includes(response.status),
        displayMessage:rejectionCodes.get(failure?.error),
      });
    }
    const receipt = await response.json();
    if (!receipt?.recommendationId || (payload.execution && !receipt.tradeId)) throw Error('正式系统未返回完整编号。');
    return receipt;
  };
}
