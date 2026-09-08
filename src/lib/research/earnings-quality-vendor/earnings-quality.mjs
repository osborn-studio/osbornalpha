// Original OSBORN implementation. No network, LLM, hidden defaults or side effects.
export const ENGINE_VERSION = '0.1.0-candidate';
const METRICS = ['revenue', 'net_income', 'operating_cash_flow', 'capex'];
const DAY = 86400000;
const fail = (message) => { throw new Error(`EARNINGS_INPUT: ${message}`); };
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function shape(v, required, optional = []) {
  if (!plain(v) || required.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => ![...required, ...optional].includes(k))) fail('Invalid or unknown fields');
}
function text(v, name, max = 256) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) fail(`Invalid ${name}`);
}
function date(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) fail('Invalid date');
}
function period(v) {
  shape(v, ['start', 'end']); date(v.start); date(v.end);
  if (v.start > v.end) fail('Invalid period');
}
const days = p => (Date.parse(p.end) - Date.parse(p.start)) / DAY + 1;
const samePeriod = (a, b) => a.start === b.start && a.end === b.end;
function list(v, max) { if (!Array.isArray(v) || v.length > max) fail('Too many or invalid items'); }
function unique(v) { if (new Set(v).size !== v.length) fail('Duplicate IDs'); }
function number(v) { if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e15 || (v !== 0 && Math.abs(v) < 1e-12)) fail('Unsupported numeric precision'); }

export function validateInput(raw) {
  // Round-trip removes object aliases; rejects cycles and bounds host/tool input.
  let serialized;
  try { serialized = JSON.stringify(raw); } catch { fail('Not JSON serializable'); }
  if (!serialized || new TextEncoder().encode(serialized).byteLength > 131072) fail('Input exceeds 128 KiB');
  // Validate raw first: JSON must not silently turn NaN/Infinity into null.
  shape(raw, ['schemaVersion', 'entity', 'asOf', 'periods', 'sources', 'facts', 'thesis']);
  if (raw.schemaVersion !== '1') fail('Unsupported schema version');
  text(raw.entity, 'entity', 160); date(raw.asOf);
  shape(raw.periods, ['current', 'prior']);
  for (const p of Object.values(raw.periods)) { period(p); if (days(p) < 350 || days(p) > 380) fail('Only full-year periods are supported'); }
  const { current, prior } = raw.periods;
  const yearGap = (Date.parse(current.end) - Date.parse(prior.end)) / DAY;
  if (prior.end >= current.start || current.end > raw.asOf || yearGap < 350 || yearGap > 380 || Math.abs(days(current) - days(prior)) > 8) fail('Incomparable annual periods or cutoff');
  list(raw.sources, 32); list(raw.facts, 128); list(raw.thesis, 16);
  unique(raw.sources.map(s => s?.id)); unique(raw.facts.map(f => f?.id)); unique(raw.thesis.map(t => t?.id));
  for (const s of raw.sources) {
    shape(s, ['id', 'title', 'url', 'filedAt']); text(s.id, 'source ID', 64); text(s.title, 'source title'); text(s.url, 'source URL', 2048); date(s.filedAt);
    let u; try { u = new URL(s.url); } catch { fail('Invalid source URL'); }
    if (u.protocol !== 'https:' || u.username || u.password || s.filedAt > raw.asOf) fail('Unsafe source URL or future source date');
  }
  for (const f of raw.facts) {
    shape(f, ['id', 'metric', 'role', 'value', 'entity', 'period', 'currency', 'unit', 'basis', 'sourceId', 'locator']);
    text(f.id, 'fact ID', 64); text(f.entity, 'entity', 160); text(f.basis, 'basis', 64); text(f.locator, 'source locator', 512);
    if (!METRICS.includes(f.metric) || !['actual', 'estimate'].includes(f.role) || !['ones', 'thousands', 'millions'].includes(f.unit) || !/^[A-Z]{3}$/.test(f.currency)) fail('Invalid fact dimensions');
    number(f.value); period(f.period);
    const s = raw.sources.find(s => s.id === f.sourceId);
    if (!s) fail('Unknown source ID');
    if (f.role === 'actual' && (s.filedAt < f.period.end || f.period.end > raw.asOf)) fail('Actual fact not available at filing/cutoff');
  }
  for (const t of raw.thesis) {
    shape(t, ['id', 'text', 'createdAt'], ['rule']); text(t.id, 'thesis ID', 64); text(t.text, 'thesis', 1000); date(t.createdAt);
    if (t.createdAt > raw.asOf) fail('Future thesis date');
    if (t.rule !== undefined) {
      shape(t.rule, ['metric', 'operator', 'threshold']); number(t.rule.threshold);
      if (!['cash_conversion', 'net_margin'].includes(t.rule.metric) || !['gte', 'lte'].includes(t.rule.operator)) fail('Invalid thesis rule');
    }
  }
  return JSON.parse(serialized);
}

const unavailable = (reason, formula, factIds = []) => ({ status: 'unavailable', value: null, reason, formula, factIds });
const computed = (value, formula, factIds) => Number.isFinite(value) ? { status: 'computed', value, reason: null, formula, factIds } : unavailable('nonfinite-result', formula, factIds);
function selected(input, metric, p) {
  const facts = input.facts.filter(f => f.metric === metric && f.role === 'actual' && samePeriod(f.period, p));
  return { fact: facts.length === 1 ? facts[0] : null, reason: facts.length > 1 ? 'ambiguous-facts' : 'missing-actual-fact', ids: facts.map(f => f.id) };
}
function pair(input, a, b) {
  if (!a.fact || !b.fact) return !a.fact ? a.reason : b.reason;
  if (a.fact.entity !== input.entity || b.fact.entity !== input.entity) return 'entity-mismatch';
  for (const key of ['currency', 'unit', 'basis']) if (a.fact[key] !== b.fact[key]) return `${key}-mismatch`;
  return null;
}
function measure(input, a, b, formula, operation, positiveDenominator = false) {
  const ids = [...a.ids, ...b.ids], reason = pair(input, a, b);
  if (reason) return unavailable(reason, formula, ids);
  if (positiveDenominator && b.fact.value <= 0) return unavailable('non-positive-denominator', formula, ids);
  return computed(operation(a.fact.value, b.fact.value), formula, ids);
}
function snapshot(input, p) {
  const get = m => selected(input, m, p), cash = get('operating_cash_flow'), income = get('net_income'), capex = get('capex');
  return {
    cashConversion: measure(input, cash, income, 'operating_cash_flow / net_income', (a, b) => a / b, true),
    netMargin: measure(input, income, get('revenue'), 'net_income / revenue', (a, b) => a / b, true),
    cashLessCapex: capex.fact?.value < 0 ? unavailable('capex-must-be-positive-outflow', 'operating_cash_flow - capex', [...cash.ids, ...capex.ids]) : measure(input, cash, capex, 'operating_cash_flow - capex', (a, b) => a - b),
  };
}

export function analyzeEarnings(raw) {
  const input = validateInput(raw), { current: cp, prior: pp } = input.periods;
  const current = snapshot(input, cp), prior = snapshot(input, pp);
  const changes = Object.fromEntries(METRICS.map(metric => {
    const a = selected(input, metric, cp), b = selected(input, metric, pp);
    return [metric, { absolute: measure(input, a, b, `${metric}.current - ${metric}.prior`, (x, y) => x - y), growth: measure(input, a, b, `(${metric}.current - ${metric}.prior) / ${metric}.prior`, (x, y) => (x - y) / y, true) }];
  }));
  const cash = selected(input, 'operating_cash_flow', cp), income = selected(input, 'net_income', cp);
  const comparable = !pair(input, cash, income);
  const relation = !comparable ? 'unavailable' : cash.fact.value > income.fact.value ? 'greater' : cash.fact.value < income.fact.value ? 'less' : 'equal';
  const cashRelation = {
    relation, factIds: [...cash.ids, ...income.ids],
    text: !comparable ? '现金流与净利润不可比；请核对原始数据和口径。' : `经营现金流 ${cash.fact.value} ${ {greater:'大于',less:'小于',equal:'等于'}[relation] }净利润 ${income.fact.value}（${cash.fact.currency} / ${cash.fact.unit}）。此数值关系不证明盈利可持续性。`,
  };
  const thesis = input.thesis.map(t => {
    const operands = t.rule?.metric === 'cash_conversion' ? ['operating_cash_flow','net_income'] : ['net_income','revenue'];
    const crossPeriod = operands.map(metric => pair(input, selected(input, metric, cp), selected(input, metric, pp))).find(Boolean);
    const reason = !t.rule ? 'qualitative-thesis' : t.createdAt > cp.start ? 'thesis-not-preexisting' : crossPeriod ? `cross-period-${crossPeriod}` : null;
    const key = t.rule?.metric === 'cash_conversion' ? 'cashConversion' : 'netMargin';
    const test = v => reason || v.value === null ? 'unassessed' : (t.rule.operator === 'gte' ? v.value >= t.rule.threshold : v.value <= t.rule.threshold) ? 'met' : 'breached';
    const before = test(prior[key]), after = test(current[key]);
    return { id: t.id, text: t.text, prior: before, current: after, transition: `${before}->${after}`, factIds: reason ? [] : [...prior[key].factIds, ...current[key].factIds], reason: reason ?? (before === 'unassessed' || after === 'unassessed' ? 'metric-unavailable' : null) };
  });
  const warnings = ['仅验证给定事实的计算，不鉴定来源真伪，不证明因果、持续性或投资价值。', 'CFO−资本支出只是简化现金指标，不是 FCFF；未调整股权激励、租赁、并购或营运资本。', '未提供一致预期比较，不输出超预期/不及预期结论。', '旧期事实采用输入来源的列报口径，可能含重述；这不是历史时点回测。', '数值 Thesis 条件由调用方设定；不自动评价定性 Thesis，不代表投资建议。'];
  if (days(cp) !== days(pp)) warnings.push(`期间长度不同：当期 ${days(cp)} 天，前期 ${days(pp)} 天（可能为 52/53 周）；变动未按天数归一化。`);
  if (input.facts.some(f => f.role === 'estimate')) warnings.push('estimate 事实被排除，不能替代 actual。');
  return { engineVersion: ENGINE_VERSION, skillId: 'finance.earnings-interpretation', coverage: 'sourced-facts-deterministic', entity: input.entity, asOf: input.asOf, requiresHumanReview: true, current, prior, changes, cashRelation, thesis, warnings, sources: input.sources, facts: input.facts };
}

const SEC_TAGS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  net_income: ['NetIncomeLoss'], operating_cash_flow: ['NetCashProvidedByUsedInOperatingActivities'], capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
};
export function fromSecCompanyFacts(raw, options) {
  // Uploaded SEC response is untrusted. No fetch or implicit entity/tag selection.
  shape(options, ['cik', 'asOf', 'current', 'prior', 'accession'], ['thesis']);
  if (!Number.isSafeInteger(options.cik) || options.cik < 1 || options.cik > 9999999999 || !/^\d{10}-\d{2}-\d{6}$/.test(options.accession)) fail('Invalid SEC identity/accession');
  date(options.asOf); period(options.current); period(options.prior);
  if (!plain(raw) || Number(raw.cik) !== options.cik || typeof raw.entityName !== 'string' || !plain(raw.facts?.['us-gaap'])) fail('SEC issuer or US-GAAP facts missing');
  const facts = [], sourceId = `sec-${options.accession}`, filingDates = new Set();
  for (const [metric, tags] of Object.entries(SEC_TAGS)) for (const [slot, p] of [['current', options.current], ['prior', options.prior]]) {
    const matches = [];
    for (const tag of tags) {
      const rows = raw.facts['us-gaap'][tag]?.units?.USD;
      if (rows === undefined) continue;
      if (!Array.isArray(rows) || rows.length > 20000) fail('Invalid SEC rows');
      rows.forEach((r, index) => {
        if (!plain(r) || r.accn !== options.accession || r.start !== p.start || r.end !== p.end || r.form !== '10-K') return;
        date(r.filed); number(r.val);
        if (r.filed > options.asOf) return;
        matches.push({tag, index, row: r});
      });
    }
    if (!matches.length) continue;
    if (new Set(matches.map(m => `${m.tag}:${m.row.val}:${m.row.filed}`)).size !== 1) fail(`Conflicting or ambiguous SEC ${metric} facts`);
    const m = matches[0]; filingDates.add(m.row.filed);
    facts.push({id:`${slot}-${metric}`,metric,role:'actual',value:m.row.val,entity:raw.entityName,period:p,currency:'USD',unit:'ones',basis:'US-GAAP',sourceId,locator:`/facts/us-gaap/${m.tag}/units/USD/${m.index}; accession=${options.accession}; ${p.start}..${p.end}`});
  }
  if (!facts.length || filingDates.size !== 1) fail('No matching SEC facts or conflicting filing dates');
  return validateInput({schemaVersion:'1',entity:raw.entityName,asOf:options.asOf,periods:{current:options.current,prior:options.prior},sources:[{id:sourceId,title:`SEC 10-K ${options.accession}`,url:`https://www.sec.gov/Archives/edgar/data/${options.cik}/${options.accession.replaceAll('-', '')}/${options.accession}-index.html`,filedAt:[...filingDates][0]}],facts,thesis:options.thesis ?? []});
}
