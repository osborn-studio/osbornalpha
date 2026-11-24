export const BEIJING_TIME_ZONE = 'Asia/Shanghai';
const beijingOffsetMs = 8 * 60 * 60 * 1000;

// The forms exchange Beijing wall-clock minutes with datetime-local controls
// and ISO instants with the recommendations API.
export function fromBeijingDateTimeInput(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new RangeError('Invalid Beijing date and time');
  const wallTime = match[1] + ':' + (match[2] ?? '00') + '.' + (match[3] ?? '').padEnd(3, '0');
  const instant = new Date(wallTime + '+08:00');
  const beijingClock = new Date(instant.getTime() + beijingOffsetMs);
  if (!Number.isFinite(beijingClock.getTime()) || beijingClock.toISOString() !== wallTime + 'Z') {
    throw new RangeError('Invalid Beijing date and time');
  }
  return instant.toISOString();
}

export function toBeijingDateTimeInput(iso: string): string {
  const beijingClock = new Date(Date.parse(iso) + beijingOffsetMs);
  return beijingClock.toISOString().slice(0, 16);
}
