const sections = ['recommendations','scores','trades'];
const scopes = new Set(['self','named','context','all']);
const privateLabel = /[\p{C}<>@|｜]|https?:|(?:^|\b)(?:ou|oc|om|on|cli)_|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}|^[0-9a-f]{24,}$/iu;

function allowedSections(value) {
  return Array.isArray(value) && value.length>0 && value.length<=sections.length &&
    value.every(key=>sections.includes(key)) && new Set(value).size===value.length;
}

// Only send verified topic and public names to the model.
export function publicFeishuReadContext(value) {
  if (value?.source==='report_scope_question' && allowedSections(value.sections)) {
    return {source:value.source,sections:sections.filter(key=>value.sections.includes(key))};
  }
  if (value?.source!=='formal_report' || !['named','all'].includes(value.scope)) return null;
  const result={source:'formal_report',scope:value.scope};
  if (value.scope==='named' && typeof value.analyst==='string') {
    const label=value.analyst.trim();
    if (label && label.length<=150 && !privateLabel.test(label.normalize('NFKC'))) result.analyst=label;
  }
  if (allowedSections(value.sections)) result.sections=sections.filter(key=>value.sections.includes(key));
  return result;
}

// The model can request a read. The workflow resolves public names, checks the requester and chooses the account.
export function parseFeishuReadTool(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys=Object.keys(value);
  if (value.read === 'pending' || value.read === 'analyst_roster' || value.read === 'group_report') {
    return keys.length === 1 ? {read:value.read} : null;
  }
  if (value.read !== 'formal_report' || !scopes.has(value.scope) || !allowedSections(value.sections)) return null;
  if (keys.some(key => !['read','sections','scope','subject'].includes(key))) return null;
  const result = {read:value.read,sections:sections.filter(key => value.sections.includes(key)),scope:value.scope};
  if (value.scope !== 'named') return Object.hasOwn(value,'subject') ? null : result;
  if (typeof value.subject !== 'string') return null;
  const name = value.subject.normalize('NFKC').trim();
  if (!name || name.length > 60 || privateLabel.test(name)) return null;
  return {...result,subject:name};
}
