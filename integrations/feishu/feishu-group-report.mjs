import {publicAnalystDirectory} from './feishu-analyst-roster.mjs';

const namedHeading='正式模拟账户查询（指定分析师，北京时间）';
const groupHeading='本群分析师正式记录（北京时间）';
const sizeLimit=16000;

function groupReport(reports){
  const blocks=reports.map(({label,text})=>{
    // Each response was requested by one bound analyst key. Reject a server that reports a wider scope.
    const [heading,...body]=text.trim().split('\n');
    if(heading!==namedHeading||!body.some(line=>line.trim()))throw Error('无法核实正式查询的分析师范围。');
    return {label,body:body.join('\n').trim().replace(/^我的投资 · 建议关联的模拟成交（/gmu,'分析师建议关联的模拟成交（')};
  });
  const render=items=>[groupHeading,...items].join('\n\n');
  const full=render(blocks.map(({label,body})=>label+'\n'+body));
  const fits=text=>text.length<10000&&Buffer.byteLength(text,'utf8')<=sizeLimit;
  if(fits(full))return full;

  // Keep the formal counts and denominators for each analyst when details exceed the webhook limit.
  const parts=['明细较多，以下按人汇总。点名查询可查看该分析师的明细。'];
  for(const [index,{label,body}] of blocks.entries()){
    const summary=body.split('\n').filter(line=>/^(?:正式分析建议（|分析师建议关联的模拟成交（|有效建议 )/u.test(line));
    const compact=label+'\n'+(summary.join('\n')||'请点名查看明细。');
    const remainder='其余 '+(blocks.length-index)+' 位分析师请点名查询。';
    if(!fits(render([...parts,compact,remainder]))){parts.push(remainder);break;}
    parts.push(compact);
  }
  return render(parts);
}

export function createGroupScopedReader(read,config){
  return async request=>{
    const {expectedOwnerId,analystKey,analystKeys,sections}=request;
    const current=config();
    const groupId=current.chatId;
    function directory(bindings){
      if(!groupId||bindings.chatId!==groupId||bindings.simulationAccount?.confirmed!==true||
        bindings.simulationAccount.id!==expectedOwnerId)throw Error('正式模拟账户绑定已变更。');
      return publicAnalystDirectory(bindings).filter(entry=>!entry.demo);
    }
    const members=directory(current);
    if(analystKey!==null){
      const includesAnalyst=entries=>entries.some(entry=>entry.role===analystKey);
      if(!includesAnalyst(members))throw Error('分析师未绑定到当前群。');
      const text=await read({expectedOwnerId,analystKey,sections});
      if(!includesAnalyst(directory(config())))throw Error('分析师绑定已变更。');
      return text;
    }
    const expected=Array.isArray(analystKeys)?new Set(analystKeys):null;
    function checkMembers(entries){
      if(!expected||entries.length!==expected.size||entries.some(entry=>!expected.has(entry.role))){
        throw Error('本群分析师范围已变更。');
      }
    }
    checkMembers(members);
    if(!members.length)return '本群尚未绑定可查询的正式分析师。';
    const reports=[];
    // Deployed versions of the formal endpoint support named reads. A missing key could read the whole account.
    for(let offset=0;offset<members.length;offset+=4){
      checkMembers(directory(config()));
      const batch=await Promise.all(members.slice(offset,offset+4).map(async ({role,label})=>({
        label:label||'本群已绑定分析师',text:await read({expectedOwnerId,analystKey:role,sections}),
      })));
      reports.push(...batch);
    }
    checkMembers(directory(config()));
    return groupReport(reports);
  };
}
