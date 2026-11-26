import {createHash,randomInt,randomUUID} from 'node:crypto';
import {readProbe,readCategories,readTasks,asExtractorRead} from './read-cases.mjs';
import {frictionTaskFamilies} from './friction-label.mjs';

// These probes have independent, program-authored answers. Only the topic is selected from an incident.
// They never incorporate a member's wording, numbers, account or the model's proposed answer.
const securities=[
  ['微软','MSFT','US','美元','USD'],['苹果','AAPL','US','美元','USD'],
  ['可口可乐','KO','US','美元','USD'],['英伟达','NVDA','US','美元','USD'],
  ['腾讯控股','00700.HK','HK','港元','HKD'],['汇丰控股','00005.HK','HK','港元','HKD'],
  ['长江电力','600900.SH','A','人民币','CNY'],['贵州茅台','600519.SH','A','人民币','CNY'],
];
export const acceptanceFamilies={extraction:['intent','security','execution','price_roles','read_intents'],chat:['casual','status','figures','procedure','reads']};
const scopeName={US:'美股',HK:'港股',A:'A股'};
const noProposal={route:'no_proposal'};
const joinTime=(hour,min)=>hour+'点'+String(min).padStart(2,'0')+'分';
const proposal=(fields,optionalFields={})=>({intent:'proposal',fields,optionalFields});
const help=topic=>({intent:'help',fields:{},helpTopic:topic});
const advise=(ticker,action,fields={})=>({route:'pm_advice',fields:{ticker,action,...fields}});
const ask=(missing,fields)=>({route:'request_details',missing,fields});
const sale=(ticker,action,n,price)=>({route:'pm_simulation',fields:{ticker,action},simulation:{quantity:n,price,fee:0,direction:'buy'}});
const extract=(text,expect,business,input={})=>({input:{text,...input},expect,business});
const chat=(text,expect,input={})=>({input:{text,...input},expect});

function extractionCase(family,i,s){
  const {name,ticker,market,amount,n,price,unit,currency,when}=s;
  const board=scopeName[market], priorFields={ticker,market,action:'buy',executionMode:'simulate',price,currency};
  if(family==='read_intents')return asExtractorRead(readProbe(readCategories[(i+s.n)%readCategories.length],i,s));
  if(family==='intent'){
    if(i%3===0) return extract('午会上有人说要买'+n+'股'+name+'，我只是转达他的原话。',{intent:'other',fields:{}},noProposal);
    if(i%3===1) return extract('如果以后价格回到'+price+'，你觉得'+name+'适合买入吗？',help('investment'),noProposal);
    return extract('别人'+when+'说想卖掉。我自己的建议只有一个，继续持有'+name+'。',proposal({securityName:name,action:'hold'}),advise(ticker,'hold'));
  }
  if(family==='security'){
    if(i%3===0) return extract('例会安排在'+when+'。我此刻的建议是持有'+board+name+'。',proposal({securityName:name,market,action:'hold'}),advise(ticker,'hold'));
    if(i%3===1) return extract('建议对代码 '+ticker+' 暂时观望，参考价为'+price+unit+'。',proposal({ticker,action:'pass',reference_price:price},{currency}),advise(ticker,'pass',{reference_price:price}));
    return extract(when+'是下次会议时间。现在我自己的建议是继续持有'+name+'，帮我登记这条建议。',proposal({securityName:name,action:'hold'}),advise(ticker,'hold'));
  }
  if(family==='execution'){
    if(i%3===0) return extract('我准备拿'+amount+unit+'建仓'+name+'，请登记这笔模拟买入。',proposal({securityName:name,action:'buy',executionMode:'simulate'},{currency}),ask(['quantity','price'],{ticker,action:'buy'}));
    if(i%3===1) return extract('这次是'+n+'股，请按这个数量。',proposal({quantity:n}),sale(ticker,'buy',n,price),
      {isSupplement:true,pendingFields:['quantity'],priorFields});
    return extract('我原先有'+(n+11)+'股；这次拟模拟买入 '+ticker+' '+n+'股，模拟成交价'+price+unit+'。',proposal({ticker,action:'buy',quantity:n,price,currency,executionMode:'simulate'}),sale(ticker,'buy',n,price));
  }
  if(i%3===0) return extract('我建议持有 '+ticker+'。后面要是跌到'+price+'，我们再讨论要不要卖。',proposal({ticker,action:'hold'}),advise(ticker,'hold'));
  if(i%3===1) return extract('我的建议是持有 '+ticker+'，本次明确的止损价为'+price+unit+'。',proposal({ticker,action:'hold',stop_loss:price},{currency}),advise(ticker,'hold',{stop_loss:price}));
  const target=Number((price+8).toFixed(1));
  return extract('本次建议继续持有'+name+'，参考价'+price+unit+'，目标价'+target+unit+'。',proposal({securityName:name,action:'hold',reference_price:price,target_price:target},{currency}),advise(ticker,'hold',{reference_price:price,target_price:target}));
}

function chatCase(family,i,s){
  const {name,ticker,n,price,when,currency}=s;
  const execution={direction:'buy',quantity:n,price,currency};
  const context=status=>({proposalContext:{ticker,action:'buy',status,execution}});
  const money={USD:['美元','美金','USD'],CNY:['人民币','元','CNY'],HKD:['港元','港币','HKD']}[currency];
  if(family==='reads')return readProbe(readCategories[(i+s.n)%readCategories.length],i,s);
  if(family==='casual'){
    if(i%3===0) return chat('已经'+when+'啦，喊你一声，在吗？',{concepts:[['在','来了','听着','听到','怎么啦','怎么了']],avoid:['审批|模拟成交|确认人|权限'],maxChars:90});
    if(i%3===1) return chat('我在'+when+'说要聊哪家公司来着？',{concepts:[[name]],avoid:['已登记这条|已成交']},
      {history:[{role:'user',content:'等一会我想聊聊'+name+'。'},{role:'assistant',content:'行，你说。'}]});
    return chat('刚才'+when+'那会儿喊了你好几声，听得到么？',{concepts:[['在','听到','听得','来了','收到','听见']],avoid:['权限|审批|模拟成交'],maxChars:90});
  }
  if(family==='status'){
    if(i%3===0) return chat('这笔'+n+'股的提案目前登记好了吗？',{concepts:[['待.{0,6}确认','等.{0,8}确认','尚未.{0,4}登记','还没.{0,4}登记']],criticalAvoid:['已经登记成功|已经成交']},context('awaiting_approval'));
    if(i%3===1) return chat('我在'+when+'问一下，现在还要人确认还是等系统写入？',{concepts:[['已.{0,4}确认','确认过','已经通过'],['等.{0,8}(同步|写入|登记)','待.{0,6}(同步|写入|登记)','同步中']],criticalAvoid:['已经成交|等待PM确认']},context('pending_formal_sync'));
    return chat('刚在'+when+'看见回执，这条还要重新登记吗？',{concepts:[['已.{0,5}(登记|录入)','登记好了','登记过']],criticalAvoid:['等待.{0,4}确认|我已替你']},context('registered'));
  }
  if(family==='figures'){
    const askPrice=i%2===0;
    const text=askPrice?'这份摘要写了'+n+'股，模拟成交的单价和币种各是多少？':'我看到了每股'+price+'。我只想核对摘要里申请了几股。';
    return chat(text,{concepts:askPrice?[money]:[['股']],numbers:{required:[askPrice?price:n],allowed:[price,n,...(ticker.match(/\d+/g)??[])]}},context('awaiting_approval'));
  }
  if(i%3===0) return chat('我是确认人。'+when+'看到一条待确认建议，该在哪儿回复哪两个字？',{concepts:[['摘要','原消息','待确认消息'],['同意']]},{isApprover:true});
  if(i%3===1) return chat('我只是旁听的，'+when+'看到摘要后我回同意算数吗？',{concepts:[['不算','不行','无效','不能','只有','仅','需要.{0,8}(确认人|PM)'],['PM','确认人','审批人','授权','绑定']]},{isApprover:false});
  return chat('我在'+when+'决定模拟买入，只给预算，成交参数还需要补哪两项？',{concepts:[['股数','数量','多少股'],['每股','单价','成交价']]},{isAnalyst:true});
}

// The optimizer receives none of these phrases. A task is a closed code from
// corroborated feedback; no text or numbers from the conversation enter a probe.
function targetedCase(task,i,s){
  const {name,ticker,market,unit,currency,price,n,amount,when}=s;
  const line=alternatives=>alternatives[i%alternatives.length];
  const price2=(Math.round(price*10)+73)/10;
  const tradeContext={ticker,market,action:'buy',executionMode:'simulate',currency};
  const statusContext=status=>({proposalContext:{ticker,action:'buy',status,execution:{direction:'buy',price,quantity:n,currency}}});
  const money={USD:['美元','美金','USD'],HKD:['港元','港币','HKD'],CNY:['人民币','元','CNY']}[currency];
  if(Object.hasOwn(readTasks,task)){
    const probe=readProbe(task.replace(/^(?:extract_)?read_/u,''),i,s);
    return task.startsWith('extract_')?asExtractorRead(probe):probe;
  }
  switch(task){
    case 'investment_question':
      return extract(line([
        '你觉得'+name+'到'+price+unit+'还值得买吗？想听听你的判断。',
        '假设手头有'+amount+unit+'，此时配置'+name+'合不合适？',
        '大家在谈'+name+'。如果我是今天才关注，该不该买入？刚才'+when+'没听清。',
        name+'这票到'+price+'了，我想听你聊聊它还适合持有吗？',
      ]),help('investment'),noProposal);
    case 'quoted_view':
      return extract(line([
        '摘录研究会'+when+'的发言：“'+name+'可以买。”以上是发言人的观点。',
        '隔壁组说到'+price+'就应当增持'+name+'；原话转过来供大家看。',
        '以下是同事的记述，他判断应减持'+n+'股'+name+'。这里仅作会议纪要。',
        '转述一下听到的观点：'+name+'卖出价看到'+price+unit+'。这句话是嘉宾说的。',
      ]),{intent:'other',fields:{}},noProposal);
    case 'missed_owned':
      return extract(line([
        '下一场会议在'+when+'。别人有别人的意见，我给组合的建议是继续持有'+name+'。',
        '我自己的建议是持有'+name+'。另外，路演安排在'+when+'，到时可以问公司。',
        '访谈定在'+when+'。我现在有个确定的意见，请登记为我的建议：继续持有'+name+'。',
        '会议纪要写到这里，下次例会是'+when+'。我另外提一条自己的建议：继续持有'+name+'。',
      ]),proposal({securityName:name,action:'hold'}),advise(ticker,'hold'));
    case 'stock_name':
      return extract(line([
        '我建议继续持有'+name+'股票。对了，下次例会定在'+when+'。',
        '下一场电话会在'+when+'。我说的标的叫'+name+'，我建议继续持有这只股票。',
        '访谈安排在'+when+'。我的建议是继续持有'+name+'，标的就是这家公司。',
        '先说我的建议：持有'+name+'股票。路演开始时间是'+when+'，有空来听。',
      ]),proposal({securityName:name,action:'hold'}),advise(ticker,'hold'));
    case 'conditional_stop':
      return extract(line([
        '我的建议是持有 '+ticker+'。以后若滑到'+price+'我们再开会研究。',
        '我主张继续持有 '+ticker+'；'+price+'以下需再聊聊，现在没决定怎么处理。',
        '如果 '+ticker+' 有天碰到'+price+'，请大家再讨论。今天我正式给出的建议只有持有。',
        '对 '+ticker+' 我仍然建议持有。跌穿'+price+'之后是否要卖另议。',
      ]),proposal({ticker,action:'hold'}),advise(ticker,'hold'));
    case 'swapped_prices':{
      const text=line([
        '汇报两个数字：参考价为'+price2+unit+'，实际模拟成交价为'+price+unit+'。',
        '这单每股成交价是'+price+unit+'；另外，建议那栏的参考价是'+price2+unit+'。',
        '两个价分别填：建议的参考价'+price2+unit+'、本次的模拟成交价'+price+unit+'。',
        '模拟成交价用'+price+unit+'，另一栏是参考价'+price2+unit+'，请分开。',
      ]);
      const expected={...sale(ticker,'buy',n,price),fields:{ticker,action:'buy',reference_price:price2}};
      return extract(text,proposal({reference_price:price2,price,currency},{executionMode:'simulate'}),expected,
        {isSupplement:true,pendingFields:['price'],priorFields:{...tradeContext,quantity:n}});
    }
    case 'cash_budget':
      return extract(line([
        '我给组合的模拟建仓建议是买'+name+'，能调拨的总预算为'+amount+unit+'。',
        '这一笔准备模拟买入'+name+'，我手里的预算一共是'+amount+unit+'。',
        '拟买'+name+'，总共拿出'+amount+unit+'资金用于这笔模拟交易，股数待商定。',
        '我决定模拟买入'+name+'，'+amount+unit+'是这次可动用的资金上限。',
      ]),proposal({securityName:name,action:'buy',executionMode:'simulate'},{currency}),ask(['quantity','price'],{ticker,action:'buy'}));
    case 'share_count':
      return extract(line([String(n),n+'股','这次的数量选'+n+'股。','刚才漏的数量是'+n+'股。']),
        proposal({quantity:n}),sale(ticker,'buy',n,price),
        {isSupplement:true,pendingFields:['quantity'],priorFields:{...tradeContext,price}});
    case 'forgot_context':{
      if(i>=4)return chat(line(['我在'+when+'说的是哪家？请翻翻这串对话。','刚才'+when+'我提到谁了？我想把话题接上。']),
        {concepts:[['没.{0,12}(提|名|说|看到|找到|记录)','再.{0,8}(说|给|发|提醒)','哪家','哪只','提示','没有.{0,8}(信息|记录|上下文)']],
          criticalAvoid:[securities.map(([company,symbol])=>company+'|'+symbol.replaceAll('.','\\.')).join('|')]},
        {history:[{role:'user',content:'先聊几句吧。'},{role:'assistant',content:'好，你说。'}]});
      return chat(line(['在'+when+'我提过谁？就问刚才说过的公司名称。','能接着'+when+'的话头吗，我们上一条说的是哪家公司？',
        '刚到'+when+'，我把前面说的标的忘了。你还记得是哪一家吗？','我在'+when+'把话题岔开了，刚才打算研究哪家公司来着？']),
        {concepts:[[name,ticker.replaceAll('.','\\.')]],avoid:['从没提|未提.{0,4}公司|没提.{0,4}(名字|公司)']},
        {history:[{role:'user',content:line(['下一个想看'+name+'的业务。','翻完公告我想谈谈'+name+'。',
          '今天先聊 '+ticker+'，也就是'+name+'。','原来的话题是'+name+'。'])},
          {role:'assistant',content:'好，我们可以接着聊。'}]});
    }
    case 'social':
      return chat(line(['到'+when+'才有空，来和你打个招呼，你在不在？','喂喂，'+when+'了，能听见我说话么？',
        '我们约的时间是'+when+'，嗨，来了吗？','现在是'+when+'，有空吗？']),
      {concepts:[['在','来','听','嗨','你好','有空','收到','好呀']],avoid:['审批|权限|模拟成交|登记建议'],maxChars:90});
    case 'approval_method':
      return chat(line(['我是确认人，'+when+'收到的那份建议应当回复哪条消息、发什么文字？',
        '作为 PM，'+when+'看到了摘要。怎样用群回复正式确认这份建议？',
        '我负责验收。要确认'+when+'的那份建议，应选哪一条原消息来回，写什么？',
        '我是绑定的确认人，'+when+'打算批准。请说具体回到哪里、用哪个口令。']),
      {concepts:[['摘要','待确认.{0,5}消息','原消息'],['同意']],criticalAvoid:['哪里.{0,5}都能确认']},{isApprover:true});
    case 'summary_quantity':
    case 'summary_price':{
      const quantity=task==='summary_quantity';
      const question=quantity?line(['摘要写每股'+price+'，实际拟买多少股？','每股'+price+'我知道，这份摘要的数量栏怎么写的？',
        '只核对拟成交股数。单价是'+price+'的那条摘要，拟买的数量是多少？','摘要的单价已知是'+price+'，要买的到底是几股？']):
        line(['摘要里列了'+n+'股。每股成交价和对应的币种能复述一下吗？','看'+n+'股的这条摘要，我问的是模拟单价，以什么货币计价？',
          '数量是'+n+'股我看到了，请直接给我这笔计划每股多少钱，包括币种。','我在核价。'+n+'股这个摘要写的拟成交单价是多少钱，哪个币种？']);
      return chat(question,{concepts:quantity?[['股','shares?']]:[money],numbers:{required:[quantity?n:price],allowed:[n,price,...(ticker.match(/\d+/g)??[])]}},statusContext('awaiting_approval'));
    }
    case 'summary_status':{
      if(i%4!==3)return chatCase('status',i%4,s);
      return chat('我在'+when+'看这条建议，后来还会执行吗？帮我核一下摘要现在的状态。',
        {concepts:[['已.{0,4}(撤回|撤销)','撤回了','撤销了']],criticalAvoid:['已.{0,3}成交|仍待确认']},statusContext('withdrawn'));
    }
    default: throw Error('未知独立验收错因。');
  }
}

export function freshAcceptance(component,focus,{task,used=new Set(),hashText=text=>text,random=randomInt,now=Date.now()}={}){
  const families=acceptanceFamilies[component];
  if(!families?.includes(focus)||task&&(frictionTaskFamilies[task]!==focus))throw Error('未知独立验收主题或错因。');
  const token=randomUUID(),holdout=[],targetIds=[],expectations=[],seen=new Set(used);
  const catalogues=Object.fromEntries(securities.map(([name,ticker,market])=>[name,[{ticker,market}]]));
  // For an incident, score its six exact-cause probes separately and retain
  // two blind controls for each broad topic (including the target's siblings).
  const batches=families.map(family=>({topic:family,count:!task&&family===focus?6:2,target:!task&&family===focus}));
  if(task)batches.unshift({topic:task,count:6,target:true});
  for(const {topic,count,target} of batches){
    for(let i=0;i<count;i++){
      let entry;
      for(let attempt=0;attempt<1000;attempt++){
        const [name,ticker,market,unit,currency]=securities[random(securities.length)];
        const input={name,ticker,market,unit,currency,n:random(1800)+2,amount:(random(3500)+1)*100,
          price:(random(4800)+200)/10,when:joinTime(random(24),random(60))};
        const test=task&&target?targetedCase(task,i,input):(component==='chat'?chatCase:extractionCase)(topic,i,input);
        const hash=hashText(test.input.text);
        if(seen.has(hash))continue;
        entry=test;seen.add(hash);break;
      }
      if(!entry)throw Error('独立验收题库需要新的措辞。');
      const id=token+'-'+topic+'-'+i;
      const row={id,group:id,split:'holdout',kind:component,input:entry.input,expect:entry.expect};
      if(component==='extraction')row.input.receivedAt=new Date(now).toISOString();
      holdout.push(row);
      if(target)targetIds.push(id);
      if(entry.business)expectations.push({id,sha256:createHash('sha256').update(JSON.stringify(row)).digest('hex'),expected:entry.business});
    }
  }
  return {holdout,targetIds,...(component==='extraction'&&{businessFixtures:{cases:expectations,catalogues}})};
}
