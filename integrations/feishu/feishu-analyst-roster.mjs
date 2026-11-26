const requestOpening = /^(?:你好|麻烦你?|请问|请你?|你知道|你?能(?:不能|否)?|可不可以|可以|帮我|给我|我想(?:知道)?|想知道|告诉我|发一下|报一下|说一下|列一下|列出|查一下|查查|查询|查看|看一下|看看)+/u;
const localQualifiers = /(?:(?:我们|咱们)(?:这个)?群|本群|这个群|当前群|群)(?:里面|内|中|里)?的?|(?:我们|咱们)的|目前|现在|当前|(?:已(?:经)?)?绑定的?|都/gu;
const listRequest = /^分析师(?:名单|名册|列表)(?:是?(?:谁|什么)|有(?:谁|哪些))?$/u;
const analystsFirst = /^分析师(?:有(?:哪些(?:人|成员)?|哪几(?:位|名|个)|谁|多少(?:名|位|个|人)?|几(?:位|名|个|人))|是(?:谁|哪几位|哪些人)|叫(?:什么(?:名字)?|啥(?:名字)?))$/u;
const questionFirst = /^(?:有)?(?:哪些(?:人|成员|位)?|哪几(?:名|位|个)|谁|几位|多少(?:位|名|个)?)(?:是|担任)?(?:已登记的?)?分析师$/u;

// Match the entire remaining question so queries about analysts' suggestions stay with formal reports.
export function isAnalystRosterQuestion(text) {
  if (typeof text !== 'string' || text.length > 200 || !text.includes('分析师')) return false;
  const compact = text.normalize('NFKC').replace(/[\s，,。！？?!]/gu, '');
  const question = compact.replace(requestOpening, '').replace(localQualifiers, '').replace(/(?:吗|呢|呀|啊|吧|么)$/u, '');
  return listRequest.test(question) || analystsFirst.test(question) || questionFirst.test(question) ||
    (question === '分析师' && /列出|查看|查一下|查询|看一下|列一下/u.test(compact));
}

const internalIdentifier = /[\p{C}<>@|｜]|https?:|(?:^|\b)(?:ou|oc|on|om|cli)_|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|^[0-9a-f]{24,}$/iu;
function publicName(value, identifiers) {
  if (typeof value !== 'string') return '';
  const name = value.normalize('NFKC').trim();
  if (!name || name.length > 60 || identifiers.has(name) || internalIdentifier.test(name)) return '';
  return name;
}

// Only names associated with an assigned group role are part of this roster.
export function analystRosterText(config) {
  const mapping = config.analystBySender ?? {};
  const identifiers = new Set([...Object.keys(mapping), ...(config.approverIds ?? []), config.chatId, config.simulationAccount?.id]);
  const roles = new Set(Object.values(mapping).filter(role => typeof role === 'string' && role.trim()));
  const lines = [];
  for (const role of roles) {
    const aliases = config.analystAliasesByRole?.[role] ?? [];
    const alias = aliases.map(value => publicName(value, identifiers)).find(Boolean);
    const namedRole = /^[\p{L}][\p{L}\p{N} .-]{0,59}$/u.test(role) && !/^analyst-/iu.test(role);
    const display = publicName(config.analystNamesByRole?.[role], identifiers) || (namedRole ? publicName(role, identifiers) : '');
    const label = alias && display && alias.toLowerCase() !== display.toLowerCase() ? alias + '（' + display + '）' : alias || display;
    const demo = config.demoOnlyRoles?.includes(role);
    lines.push((label || '尚未配置公开署名') + (demo ? ' · 仅 Demo' : ''));
  }
  const heading = lines.length ? '本群目前可核实的分析师有 ' + lines.length + ' 位。' : '当前可核实的绑定中还没有分析师。';
  if (config.demoMembershipUnavailable) lines.push('Demo 自助绑定名单暂时无法核对。');
  return [heading, ...lines].join('\n');
}
