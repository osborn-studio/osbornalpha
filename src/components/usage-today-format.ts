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
  return cost.limitMicrormb === -1
    ? formatRmb(cost.usedMicrormb)
    : `${formatRmb(cost.usedMicrormb)}/${formatRmb(cost.limitMicrormb)}`;
}

export type CostUsageRow = {
  labelKey: 'platformCost' | 'platformCostUnlimited' | 'platformCapCost' | 'platformNonExemptCost' | 'platformTotalCost';
  value: string;
};

export function costUsageRows(cost: PlatformCostUsage): CostUsageRow[] {
  const hasExemptSpend = cost.usedMicrormb !== cost.capUsedMicrormb;
  if (!hasExemptSpend) {
    return [{
      labelKey: cost.limitMicrormb === -1 ? 'platformCostUnlimited' : 'platformCost',
      value: formatCostUsage(cost),
    }];
  }
  return [
    {
      labelKey: cost.limitMicrormb === -1 ? 'platformNonExemptCost' : 'platformCapCost',
      value: cost.limitMicrormb === -1
        ? formatRmb(cost.capUsedMicrormb)
        : `${formatRmb(cost.capUsedMicrormb)}/${formatRmb(cost.limitMicrormb)}`,
    },
    { labelKey: 'platformTotalCost', value: formatRmb(cost.usedMicrormb) },
  ];
}
