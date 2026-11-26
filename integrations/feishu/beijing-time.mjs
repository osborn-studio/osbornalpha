// HTML datetime-local values have no timezone. The Demo forms and Feishu messages use Beijing time.
const utcOffsetMs = 8 * 60 * 60 * 1000;

export function beijingInputValue(instant = new Date()) {
  return new Date(new Date(instant).getTime() + utcOffsetMs).toISOString().slice(0, 16);
}

export function beijingDateTime(instant) {
  if (instant == null || instant === '') return '—';
  // Fixed replay sessions can carry only a calendar day.
  if (typeof instant === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(instant)) return instant;
  const ms = new Date(instant).getTime();
  return Number.isFinite(ms) ? new Date(ms + utcOffsetMs).toISOString().slice(0, 19).replace('T',' ') : '—';
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
