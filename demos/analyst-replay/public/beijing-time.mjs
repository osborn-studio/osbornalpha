// HTML datetime-local values have no timezone. All demo trade and recommendation forms label this field UTC+08:00.
const utcOffsetMs = 8 * 60 * 60 * 1000;

export function beijingInputValue(instant = new Date()) {
  return new Date(new Date(instant).getTime() + utcOffsetMs).toISOString().slice(0, 16);
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
