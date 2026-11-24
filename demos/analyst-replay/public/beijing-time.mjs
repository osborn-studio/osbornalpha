// HTML datetime-local values have no timezone. All demo trade and recommendation forms label this field UTC+08:00.
const utcOffsetMs = 8 * 60 * 60 * 1000;

export function beijingInputValue(instant = new Date()) {
  return new Date(new Date(instant).getTime() + utcOffsetMs).toISOString().slice(0, 16);
}

export function beijingDateTime(instant) {
  if (typeof instant === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(instant);
    if (!match) return '—';
    const day = new Date(match[1] + 'T00:00:00Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return '—';
    // Fixed replay sessions can carry only a calendar day.
    if (!match[2]) return match[1];
  } else if (typeof instant !== 'number' && !(instant instanceof Date)) {
    return '—';
  }
  const beijingClock = new Date(new Date(instant).getTime() + utcOffsetMs);
  return Number.isFinite(beijingClock.getTime()) ? beijingClock.toISOString().slice(0, 19).replace('T',' ') : '—';
}

export function beijingDate(instant) {
  return beijingDateTime(instant).slice(0, 10);
}

export function marketCalendarLabel(market) {
  return {US:'美股（纽约交易日）', HK:'港股（香港交易日）', A:'A股（北京时间交易日）'}[market] ?? '交易所交易日';
}

export function beijingInputToISO(value) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new Error('请填写有效的北京时间。');
  const wallTime = match[1] + ':' + (match[2] ?? '00') + '.' + (match[3] ?? '').padEnd(3,'0');
  const instant = new Date(wallTime + '+08:00');
  if (!Number.isFinite(instant.getTime()) || new Date(instant.getTime() + utcOffsetMs).toISOString() !== wallTime + 'Z') {
    throw new Error('请填写有效的北京时间。');
  }
  return instant.toISOString();
}
