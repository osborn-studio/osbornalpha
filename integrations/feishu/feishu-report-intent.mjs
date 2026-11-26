// This recognizer selects read-only tools. Advice, workflow help and unaddressed chat
// continue to the existing model. User text never becomes a database filter.
const sections = {
  recommendations: /建议|推荐记录/u,
  scores: /评分|打分|得分|分数|几分|命中|胜率|成绩|战绩|准不准|有多准|准确率|表现(?:怎样|如何|怎么样)/u,
  trades: /模拟(?:交易|成交|买卖)|成交(?:情况|结果|记录|明细|列表)|(?:已|实际|完成|落地|执行)(?:经|的)?(?:成交|交易)|成交了(?:哪些|多少|几笔)|哪些.{0,5}成交|(?:已经|已|最后|哪些.{0,12})(?:落|下)了?单|(?:落|下)了单|(?:组合|投资模块|账户).{0,8}(?:买卖|交易)|(?:买卖|成交).{0,8}(?:记到|记入|记在)(?:了)?(?:组合|账户)/u,
};
const queryWords = /查|看|列|哪些|准不准|有多准|汇总|统计|盘点|回顾|复盘|调出|核对|展示|报[告一下]|告诉我|想知道|发.{0,6}(?:清单|明细|列表|一份)|有(?:哪些|哪几|几条|几笔|什么|多少)|如何|怎样|怎么样|是多少|多少分|几分|情况|结果|明细|清单|列表|记录|表现|战绩|成绩/u;
const help = /怎么(?:查|看|操作|用|算|计|评分|打分|查询|查看|登记|录入|提交)|如何(?:查|看|操作|计算|评分|打分|查询|查看|登记|录入|提交)|(?:从|在)哪[里儿]?(?:查|看|登|录)|(?:评分|打分|命中率)(?:的)?(?:标准|规则|口径|算法|公式)|(?:评分|打分|模拟成交|建议登记)(?:是什么|是什么意思)|(?:能不能|可否)(?:支持|实现|添加)|(?:希望|需要)(?:实现|增加|开发)/u;
const writing = /(?:请|帮我|替我|我要|我想|我决定|我提议|我建议|建议是|建议[为：:])\s*(?:模拟)?(?:买入|卖出|建仓|加仓|减仓|清仓|持有|下单|撤回|登记|提交|录入|确认|修改|更正)|(?:修改|撤回|作废|登记|提交|录入)(?:一下|一条|这条|该条|这笔)(?:分析|交易|持仓|模拟)?(?:建议|成交|提案|记录)|(?:^|[，,；;。])\s*(?:建议|模拟)?(?:买入|卖出|加仓|减仓|下单)/u;
const newAdvice = /(?:有什么|有没有|给点|提供|征求|想听|寻求|请给|你有|有何).{0,8}(?:投资|交易|买卖|操作|选股|分析)?建议|给我(?:些|点|个|一些)?(?:投资|分析|交易|买卖|操作)?建议/u;
const unsupportedDates = /(?:今天|今日|昨天|昨日|明天|本周|这周|上周|本月|这个月|上月|今年|去年|本季|上季|近[一二三四五六七八九十百\d]+(?:天|日|周|月|年)|(?:最近|过去|前|后|最新)\s*[零一二三四五六七八九十百\d]+\s*(?:天|日|周|月|年|条|笔|次)|[12]\d{3}[-./年]\d|\d+\s*月|\d+\s*[号日](?!\s*(?:和|及|、|与|命中|评分|打分|得分)))/u;
const unsupportedDetails = /(?:只|仅|筛|限|按)(?:看|显示|查询|查|要|出|取|选|排序)?\s*(?:买入|卖出|加仓|减仓|港股|美股|A股|命中|未命中|未评分|已评分|未成交|已成交|分数|价格)|(?:买入|卖出|加仓|减仓|港股|美股|A股|未命中|未评分|已评分)(?:的)?(?:交易|建议|记录)|(?:排名|排行|最高|最低|逐笔导出|翻页|下一页)|(?:[0-9]{5,6}(?:\.HK|\.SH|\.SZ)?|[A-Z]{2,6}\.US)\b/iu;
const nameHelp = '请用一位已绑定分析师的名字查询，也可以说「查我的评分」或「查看我的建议」。';
const filterHelp = '目前可以按已绑定的分析师查询近期建议、评分和由建议产生的模拟成交。这次指定的筛选条件暂不支持，请去掉该条件再查。';
// Greedy tokenization keeps a long unknown name from causing regex backtracking in the message inbox.
const subjectWords = "我|本人|自己|大家|全体|全部|所有人|所有分析师|所有|各位分析师|每位分析师|各分析师|各个分析师|分析师|各位|他们|我们组|我们群|我们|全组|群里|群内|当前|近期|最近|最新|现有|已有|目前|已登记|已经登记|已提交|已经提交|已经实现|已实现|已完成|已执行|已落地|已成交|已发|已提|已录入|发过|提出|发出|提过|提|给|提交|写过|发表|登记|录入|由|而|按|所|已经|各自|分别|现阶段|历史|整个账户|正式系统|正式版|正式站|正式账户|账户|我的投资|投资模块|分析模块|模块|系统|记录|情况|详情|报告|打分|评分|命中率|模拟交易|模拟成交|得分|分数|和|以及|及|与|还有|而且|并|相关|落地|实现|当中|其中|里面|中的|内|里|中|建议|根据|按照|基于|关联|对应|转化|执行|产生|的|这边|这段时间|现在|所有的".split('|').sort((a,b)=>b.length-a.length);
function generalSubject(subject) {
  let offset = 0;
  while (offset < subject.length) {
    const word = subjectWords.find(item=>subject.startsWith(item,offset));
    if (!word) return false;
    offset += word.length;
  }
  return true;
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function rolesIn(text, config) {
  const matched = new Set();
  let residual = text;
  const aliases = [];
  for (const role of new Set(Object.values(config.analystBySender ?? {}))) {
    for (const label of [role, config.analystNamesByRole?.[role], ...(config.analystAliasesByRole?.[role] ?? [])]) {
      if (typeof label !== 'string' || !label.trim()) continue;
      // Single-letter legacy roles may be queried explicitly as “分析师 A”.
      const name = label.trim().normalize('NFKC');
      const pattern = /^[a-z0-9_-]$/iu.test(name) ? '分析师\\s*'+escape(name)+'(?![a-z0-9_-])' :
        /^[a-z0-9_-]+$/iu.test(name) ? '(?<![a-z0-9_-])'+escape(name)+'(?![a-z0-9_-])' : escape(name);
      aliases.push({role,name,pattern});
    }
  }
  for (const {role,pattern} of aliases.sort((a,b) => b.name.length-a.name.length)) {
    const rx = new RegExp(pattern,'giu');
    if (rx.test(residual)) {
      matched.add(role);
      residual = residual.replace(rx,' ');
    }
  }
  return {matched:[...matched],residual};
}

export function formalReportIntent(value, config) {
  if (typeof value !== 'string' || value.length > 500) return null;
  const text = value.normalize('NFKC').trim();
  if (!text || help.test(text)) return null;
  if (writing.test(text)) {
    // Never ask the proposal extractor to decide whether a quoted instruction in a lookup was new.
    const lookup = /(?:查询|查一?下|查查|查看|看看|看一?下|核对|汇总|列出|盘点|想知道).{0,100}(?:评分|打分|得分|命中|正式记录|成交记录|建议记录)|(?:那条|之前|当时|刚才|此前).{0,80}(?:建议|买入|卖出).{0,20}(?:评分|得分|命中)/u;
    if (lookup.test(text)) return {error:'请把查询与建议内容分开发送。例如「查我的评分」。如要提交新的建议，请另发一条消息。'};
    return null;
  }
  // “根据建议产生的成交” asks for the linked trades; “建议的评分” asks for scores.
  const scopeText = text.replace(/(?:根据|依据|按照|基于|源自|由|跟随)(?:分析师)?(?:的)?(?:分析)?建议/gu,'')
    .replace(/(?:分析)?建议(?:所)?(?:对应|关联|转化|产生|带来|形成|执行|促成|落地|实现)(?:的|为|成)?/gu,'')
    .replace(/(?:分析)?建议(?:现在|目前|都|又|究竟|里|有|的)*?(?=(?:(?:已经|已|最后|最终|后来)?(?:落了?单|下了?单|成交了)|准不准|有多准|表现(?:怎样|如何|怎么样)))/gu,'')
    .replace(/(?:分析)?建议(?:的)?(?=(?:评分|打分|得分|分数|命中|胜率|成绩))/gu,'');
  const requested = Object.entries(sections).filter(([,pattern]) => pattern.test(scopeText)).map(([section]) => section);
  if (!requested.length || (/准不准|有多准|表现(?:怎样|如何|怎么样)/u.test(text) && !/建议|分析师|正式系统|评分|交易|命中/u.test(text) && !rolesIn(text,config).matched.length)) return null;
  const {matched,residual} = rolesIn(text,config);
  const accountContext = /正式(?:系统|版|账户|组合)|分析模块|我的投资|(?:已登记|历史|已提交|之前的)建议/u.test(text);
  if (requested.length===1 && requested[0]==='recommendations' && newAdvice.test(text) && !matched.length &&
      !accountContext && !/(?:我|自己|我们|大家|分析师)(?:最近)?的建议/u.test(text)) return null;
  if (!queryWords.test(text) && !/^(?:(?:我的|大家的|全组|全部|分析师|的)?(?:最近|近期|最新)?\s*(?:建议|分析建议|评分|打分|命中率|得分|模拟交易|模拟成交)\s*[、，,和及与\s]*)+$/u.test(residual.trim())) return null;
  if (/这(?:一)?[条笔]|刚才那[条笔]|上[一那][条笔]|提案编号/u.test(text) && !/所有|全部|有哪些/u.test(text)) return null;
  if (unsupportedDates.test(text) || unsupportedDetails.test(text) || /\b[A-Z]{2,6}\b/u.test(residual.replace(/PM|OSBORN/giu,''))) return {error:filterHelp};
  if (matched.length > 1) return {error:nameHelp};
  // Do not turn an unknown named subject (“查王五的成绩”) into an account-wide report.
  // Common sentence openings and temporal qualifiers are harmless; other possessives need clarification.
  const trimmed = residual.replace(/(?:麻烦|请|想知道|我想|帮我|帮忙|能否|能不能|可以|给我|顺便|让我|查一查|查查看|查查|查询|查看|看看|看一看|看下|复盘|回顾|盘点|列出|列一下|调一下|告诉我|查|看|汇总|统计|一下|下|一下子|拉一下|调出)/gu,'');
  for (const match of trimmed.matchAll(/([\p{L}\p{N}]+)的(?=(?:近期|最近|最新|分析|历史|建议|推荐|打分|评分|得分|成绩|分数|命中|模拟|成交|交易|执行))/gu)) {
    if (!generalSubject(match[1])) return {error:nameHelp};
  }
  const subject = trimmed.match(/(?:^|[，,。；;])\s*([\p{L}\p{N}]+?)(?=(?:分析建议|建议|评分|打分|得分|命中率|模拟成交|模拟交易))/u)?.[1];
  if (subject && !generalSubject(subject) && !/有(?:哪些|没有|多少|几条|几笔)|目前有|哪些|想知道/u.test(subject) && !matched.length) return {error:nameHelp};
  if (/(?:分析师|标的|股票|代码)\s*[:：]?\s*[A-Za-z0-9_-]+/u.test(residual) ||
      /(?:只看|只查|仅查|筛选|只要|筛出|限于)/u.test(residual)) return {error:filterHelp};
  const everyone = /所有(?:的)?(?:分析师|成员|人)|全体|大家|全组|各(?:位|个)?分析师|每(?:位|个)分析师|整个(?:模拟)?(?:账户|组合)|全账户/u.test(text);
  const self = /(?:我|本人|自己)(?:最近|近期|名下)?的(?:分析)?(?:建议|评分|打分|得分|成绩|模拟成交|模拟交易|命中)/u.test(text);
  if (matched.length && everyone) return {error:nameHelp};
  return {sections:requested,analystKey:matched[0] ?? null,everyone,self};
}
