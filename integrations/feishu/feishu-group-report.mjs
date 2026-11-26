import {publicAnalystDirectory} from './feishu-analyst-roster.mjs';
import {renderGroupPositions, positionHeading, readPositionRows} from './feishu-position-report.mjs';

const namedHeading='正式模拟账户查询（指定分析师，北京时间）';
const groupHeading='本群分析师正式记录（北京时间）';
const sizeLimit=16000;
const fits=text=>text.length<10000&&Buffer.byteLength(text,'utf8')<=sizeLimit;

export function validateNamedHeading(heading,names) {
  return heading===namedHeading || names.some(name=>heading==='正式模拟账户查询（分析师 '+name+'，北京时间）');
}

function groupReport(reports,sections){
  const blocks=reports.map(({label,text,names})=>{
    const [heading,...lines]=text.trim().split('\n');
    if(!validateNamedHeading(heading,names)||!lines.some(line=>line.trim()))throw Error('无法核实正式查询的分析师范围。');
    const body=lines.join('\n').trim().replace(/^我的投资 · 建议关联的模拟成交（/gmu,()=>label+' · 建议关联的模拟成交（');
    const positions=sections.includes('positions') ? readPositionRows(body.split('\n\n').find(x=>x.startsWith(positionHeading))??'') : [];
    return {label,body,positions};
  });
  const render=items=>[groupHeading,...items].join('\n\n');
  const weights=renderGroupPositions(blocks.flatMap(block=>block.positions));
  const full=render([...blocks.map(({label,body})=>label+'\n'+body),weights].filter(Boolean));
  if(fits(full))return full;

  const parts=['明细较多，以下按人汇总。点名查询可查看该分析师的明细。'];
  for(const [index,{label,body,positions}] of blocks.entries()){
    const summary=body.split('\n').filter(line=>/^(?:正式分析建议（|.*建议关联的模拟成交（|有效建议 )/u.test(line));
    if(sections.includes('positions'))summary.push('持仓核算标的 '+positions.length+' 个（按成本）');
    const compact=label+'\n'+(summary.join('\n')||'请点名查看明细。');
    const remainder='其余 '+(blocks.length-index)+' 位分析师请点名查询。';
    if(!fits(render([...parts,compact,remainder]))){parts.push(remainder);break;}
    parts.push(compact);
  }
  if(weights&&fits(render([...parts,weights])))parts.push(weights);
  else if(weights && fits(render([...parts,'全组按币种的占比明细超过单条消息上限。'])))parts.push('全组按币种的占比明细超过单条消息上限。');
  return render(parts);
}

function limitNamedPositions(text,names){
  const blocks=text.trim().split('\n\n');
  if(!validateNamedHeading(blocks[0],names))throw Error('无法核实正式持仓的分析师范围。');
  const positionBlock=blocks.pop();
  const rows=readPositionRows(positionBlock);
  if(fits(text))return text;
  const lines=[blocks.join('\n\n'),'',
    positionHeading+'（共 '+rows.length+' 个标的，占比基于全部持仓，以下展示部分明细）'];
  for(const row of rows){
    if(!fits([...lines,row.text].join('\n')))break;
    lines.push(row.text);
  }
  return lines.join('\n');
}

export function createGroupScopedReader(read,config,{fullPositionRows=false}={}){
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
      const analyst=members.find(entry=>entry.role===analystKey);
      if(!analyst)throw Error('分析师未绑定到当前群。');
      let text=await read({expectedOwnerId,analystKey,sections});
      if(!directory(config()).some(entry=>entry.role===analystKey && entry.label===analyst.label))throw Error('分析师绑定已变更。');
      const names=[analyst.label,analystKey,current.analystNamesByRole?.[analystKey],...(current.analystAliasesByRole?.[analystKey]??[])].filter(Boolean);
      if(analyst.label && text.startsWith(namedHeading+'\n')){
        text=text.replace(namedHeading,()=>'正式模拟账户查询（分析师 '+analyst.label+'，北京时间）')
          .replace(/^我的投资 · 建议关联的模拟成交（/gmu,()=>analyst.label+' · 建议关联的模拟成交（');
      }
      return sections.includes('positions') && !fullPositionRows ? limitNamedPositions(text,names) : text;
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
        label:label||'本群已绑定分析师',names:[label,role,current.analystNamesByRole?.[role],...(current.analystAliasesByRole?.[role]??[])].filter(Boolean),text:await read({expectedOwnerId,analystKey:role,sections}),
      })));
      reports.push(...batch);
    }
    checkMembers(directory(config()));
    return groupReport(reports,sections);
  };
}
