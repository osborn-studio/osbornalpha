export interface PlatformCostUsage {
  usedMicrormb: number;
  capUsedMicrormb: number;
  limitMicrormb: number;
  currency: 'CNY';
}

function formatRmb(micrormb: number): string {
  const value = Number.isFinite(micrormb) && micrormb >= 0 ? micrormb : 0;
  return `¥${(value / 1_000_000).toFixed(2)}`;
}

export function formatCostUsage(cost: PlatformCostUsage): string {
  return `${formatRmb(cost.usedMicrormb)}/${cost.limitMicrormb === -1 ? '∞' : formatRmb(cost.limitMicrormb)}`;
}
