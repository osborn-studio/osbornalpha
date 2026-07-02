// Metric.tsx — label + numeric value + optional trend coloring.
import { cn } from '@/lib/utils';
import { metricTrendClass } from './variants';

export interface MetricProps {
  label: string;
  value: string;
  change?: number; // sign drives color; omit for neutral value
  className?: string;
}

export function Metric({ label, value, change, className }: MetricProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[length:var(--label-size)] text-[var(--text-dim)]">{label}</span>
      <span className={cn('num text-[length:var(--value-size)]', change !== undefined ? metricTrendClass(change) : 'text-[var(--text)]')}>
        {value}
      </span>
    </div>
  );
}
