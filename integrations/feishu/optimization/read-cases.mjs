import {formalReadSections} from '../feishu-read-tool.mjs';

// All aliases, values and dialogue turns here are fixtures. The monitor supplies only an enum.
export const readCategories = ['analyst_roster','pending',...formalReadSections,'group_report'];
export const readTasks = Object.fromEntries(readCategories.flatMap(category => [
  ['read_'+category,'reads'],['extract_read_'+category,'read_intents'],
]));

function report(section, scope, subject) {
  return {read:'formal_report',sections:[section],scope,...(subject && {subject})};
}

const trainingRequests = {
  analyst_roster:'群里哪些同事登记了分析师身份？',
  group_report:'把大家登记的建议、表现和已执行的模拟成交汇成一份群报告。',
  pending:'麻烦翻翻有哪些提案还在排队等我点头。',
  recommendations:'能翻一下我自己之前提过的投资建议吗？',
  scores:'我自己之前判断对了几回，命中率怎么样？',
  trades:'打开我名下根据建议产生的模拟成交记录。',
  positions:'想核对采纳我的建议后，各标的剩下多少股、按成本各占多少。',
};
export function readTraining(task, previous) {
  const kind=task.slice('read_'.length);
  const tool=key=>['analyst_roster','pending','group_report'].includes(key)?{read:key}:report(key,'self');
  const inputFor=key=>({text:trainingRequests[key],isApprover:key==='pending',isAnalyst:!['pending','group_report'].includes(key)});
  const requests=[{input:inputFor(kind),expect:{tool:tool(kind)}}];
  if (readCategories.includes(previous)) requests.push({input:inputFor(previous),expect:{tool:tool(previous)}});
  if (formalReadSections.includes(kind)) {
    const prior=kind==='trades'?'scores':'trades';
    const label={recommendations:'建议原文',scores:'命中情况',trades:'模拟成交',positions:'建议关联持仓'}[kind];
    requests.push({input:{text:'上面一条都没有，那同一个人的'+label+'呢？',isApprover:true,
      readContext:{source:'formal_report',scope:'named',analyst:'唐帆',sections:[prior]},
      history:[{role:'user',content:'查他的上一份记录。'},{role:'assistant',content:'本次查到 0 条。'}]},
      expect:{tool:report(kind,'context')}});
  }
  requests.push({input:{text:'那第二位叫什么？',history:[
    {role:'user',content:'刚才你提到了两位同事。'},{role:'assistant',content:'名单是陶安、卢宁。'}]},
    expect:{concepts:[['卢宁']],avoid:['陶安是第二']}});
  return requests;
}

const freshRequests = {
  analyst_roster:['这个群有哪些人是以研究员名义给建议的？','我想看看群里正式绑定的分析师名字。','当下哪些同事有分析师身份？'],
  group_report:['可以给大家出份分析简报吗？','麻烦整理一下群里建议到模拟执行的整体表现。','请在群里发份报告，把建议表现和成交放在一起。'],
  pending:['我作为本群确认人，手头还有什么需要点头？','有多少申请等我去确认？','给我列出等我验收的提案。'],
  recommendations:['想复盘一下SUBJECT之前提过的操作建议。','能列出SUBJECT此前递过的建议吗？','把SUBJECT给系统提交的建议调来看看。'],
  scores:['想看看SUBJECT以往的判断命中率如何。','能给我SUBJECT那些建议的评估成绩么？','查查SUBJECT的评分和命中表现。'],
  positions:['想了解SUBJECT的建议在组合里还持有哪些股票。','SUBJECT提过的建议里，各标的还剩多少股？','列一下按SUBJECT建议形成的持仓和成本占比。'],
  trades:['我需要核对SUBJECT的建议已经记了哪些模拟成交。','能给我SUBJECT模拟投资的成交清单吗？','帮忙翻一下SUBJECT的模拟组合实际买卖了哪些。'],
};

export function readProbe(category,index,{when,n}) {
  const alias=['罗康','程舒','苗悦','彭宁'][n%4];
  const simple=['pending','analyst_roster','group_report'].includes(category);
  const scope=['named','self','context','all'][index%4];
  const subject={named:alias,self:'我自己',context:'刚才那位',all:'全组所有分析师'}[scope];
  const input={text:'现在'+when+'有空了，'+freshRequests[category][index%3].replace('SUBJECT',subject),
    isApprover:category!=='group_report'&&(simple||scope!=='self'),isAnalyst:!simple&&scope==='self'};
  if(!simple && scope==='context'){
    input.history=[{role:'user',content:'刚才那位的上份记录呢？'},
      {role:'assistant',content:'这份报表暂时没有符合的记录。'}];
    input.readContext={source:'formal_report',scope:'named',analyst:alias,sections:[category==='trades'?'scores':'trades']};
  }
  return {input,expect:{tool:simple?{read:category}:report(category,scope,scope==='named'?alias:undefined)}};
}

// A bound analyst's first turn can be interpreted by the proposal extractor. The
// same request must select a read there, while proposing no registration or fill.
export function asExtractorRead(row) {
  const {text,history,readContext}=row.input;
  const input={text,isSupplement:false,receivedAt:'2026-04-08T08:00:00+08:00',...(history && {conversation:history}),...(readContext && {readContext})};
  return {input,expect:{intent:'read',fields:{},query:row.expect.tool},business:{route:'read_only',query:row.expect.tool}};
}
