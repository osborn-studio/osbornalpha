// Reads the same recommendation, score and fill records used by the formal analyst and portfolio pages.
import {isUuid} from '../../src/lib/portfolio/validate.ts';

const sectionNames=['recommendations','scores','trades'];
const actions={buy:'买入',add:'加仓',sell:'卖出',trim:'减仓',hold:'持有',pass:'观望'};
const regionalCurrency={A:'CNY',HK:'HKD',US:'USD'};
const rowLimit=5;
const pageSize=250;
const beijingTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const numberFormat=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:8});
const number=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const label=value=>String(value??'').replace(/[\p{Cc}\p{Cf}<>@]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,60);
const formatTime=value=>beijingTime.format(new Date(value));
const formatPrice=(price,currency)=>numberFormat.format(number(price))+' '+label(currency);
function one(value){
  if(Array.isArray(value)){
    if(value.length>1)throw Error('正式系统关联记录不唯一。');
    return value[0]??null;
  }
  return value??null;
}
export function validFormalSections(value){
  return Array.isArray(value)&&value.length>0&&value.length<=sectionNames.length&&
    new Set(value).size===value.length&&value.every(section=>sectionNames.includes(section));
}
function verifyOwner(row,ownerId){
  if(!row||row.user_id!==ownerId)throw Error('正式系统数据范围不一致。');
}
function recommendationProfile(row,ownerId,analystId){
  verifyOwner(row,ownerId);
  const profile=one(row.profile);
  verifyOwner(profile,ownerId);
  if(row.analyst_id!==profile.id||(analystId!==null&&analystId!==row.analyst_id)){
    throw Error('正式分析师绑定不一致。');
  }
  return label(profile.display_name);
}
async function getRows(query,signal){
  const {data,count,error}=await query.abortSignal(signal);
  if(error||!Array.isArray(data))throw Error('暂时无法读取正式系统记录。');
  return {rows:data,count};
}
function scoreValue(row,ownerId){
  const score=one(row.assessment);
  if(!score)return null;
  verifyOwner(score,ownerId);
  if(score.recommendation_id!==row.id)throw Error('正式评分关联异常。');
  return score;
}
function listHeader(label,total,displayed){
  return label+'（共 '+total+' 条'+(total>displayed?'，列最近 '+displayed+' 条':'')+'）';
}
function formatScoredRow(row,name,score){
  const returns=[5,20,60].map(days=>{
    const pct=number(score['forward_'+days+'d_pct']);
    return days+'日 '+(pct===null?'—':pct.toFixed(2)+'%');
  });
  const points=number(score.score);
  return formatTime(row.recommended_at)+' '+name+' '+label(row.ticker)+' '+actions[row.action]+'｜'+
    (points===null?'暂无得分':points.toFixed(1)+' 分')+'｜'+(score.hit===true?'命中':score.hit===false?'未命中':'暂无命中判定')+
    '｜'+returns.join(' / ');
}
async function readAnalysis(db,ownerId,analystId,sections,signal){
  const wantsRecommendations=sections.includes('recommendations'),wantsScores=sections.includes('scores');
  const columns=['id','user_id','analyst_id','ticker','market','action','recommended_at','withdrawn_at','reference_price','target_price','stop_loss',
    'profile:analyst_profiles!inner(id,user_id,display_name)'];
  if(wantsScores)columns.push('assessment:recommendation_scores(user_id,recommendation_id,hit,score,forward_5d_pct,forward_20d_pct,forward_60d_pct)');
  const latest=[],scored=[];
  let total=0,live=0,hitSamples=0,hits=0,scoredCount=0,pointsSum=0,cursor;
  for(;;){
    let query=db.from('recommendations').select(columns.join(','),wantsScores?{}:{count:'exact'})
      .eq('user_id',ownerId).eq('profile.user_id',ownerId);
    if(wantsScores)query=query.eq('assessment.user_id',ownerId);
    if(analystId)query=query.eq('analyst_id',analystId);
    if(cursor){
      // Only canonical database timestamps and UUIDs are interpolated in this PostgREST cursor.
      const {recommended_at:stamp,id}=cursor;
      if(!isUuid(id)||!/^\d{4}-\d\d-\d\dT[\d:.+Z-]+$/u.test(stamp))throw Error('正式建议分页游标异常。');
      query=query.or('recommended_at.lt.'+stamp+',and(recommended_at.eq.'+stamp+',id.lt.'+id+')');
    }
    const {rows,count}=await getRows(query.order('recommended_at',{ascending:false}).order('id',{ascending:false})
      .limit(wantsScores?pageSize:rowLimit),signal);
    for(const row of rows){
      const name=recommendationProfile(row,ownerId,analystId);
      if(wantsRecommendations&&latest.length<rowLimit){
        const prices=[['参考',row.reference_price],['目标',row.target_price],['止损',row.stop_loss]]
          .filter(([,value])=>number(value)!==null)
          .map(([key,value])=>key+' '+formatPrice(value,regionalCurrency[row.market]));
        latest.push([formatTime(row.recommended_at)+' '+name+' '+label(row.ticker)+' '+actions[row.action],
          ...prices,...(row.withdrawn_at?['已撤回']:[])].join('｜'));
      }
      if(!wantsScores||row.withdrawn_at)continue;
      live++;
      const assessment=scoreValue(row,ownerId);
      if(!assessment)continue;
      const points=number(assessment.score);
      if(typeof assessment.hit==='boolean'){hitSamples++;if(assessment.hit)hits++;}
      if(points!==null){pointsSum+=points;scoredCount++;}
      if((points!==null||typeof assessment.hit==='boolean')&&scored.length<rowLimit)scored.push(formatScoredRow(row,name,assessment));
    }
    if(!wantsScores){if(!Number.isInteger(count))throw Error('正式系统未返回建议总数。');total=count;break;}
    total+=rows.length;
    if(!rows.length)break;
    const next=rows.at(-1);
    if(cursor&&next.id===cursor.id)throw Error('正式建议分页未推进。');
    cursor=next;
  }
  const parts=[];
  if(wantsRecommendations)parts.push([listHeader('正式分析建议',total,latest.length),...latest].join('\n'));
  if(wantsScores){
    const aggregate=['有效建议 '+live+' 条',hitSamples?'命中率 '+(Math.round((100*hits/hitSamples)*100)/100).toFixed(1)+'%（'+hits+'/'+hitSamples+'）':'暂无可判定命中的样本',
      scoredCount?'平均分 '+(Math.round((pointsSum/scoredCount)*100)/100).toFixed(1)+'（'+scoredCount+' 条有分数）':'暂无已评分样本'];
    parts.push(['正式建议评分',aggregate.join('｜'),...(scored.length?['最近有评分或命中判定的建议',...scored]:[])].join('\n'));
  }
  return parts;
}
async function readLinkedTrades(db,ownerId,analystId,signal){
  const select='id,user_id,ticker,direction,price,quantity,fee,currency,executed_at,'+
    'decision:decisions!inner(user_id,rec:recommendations!inner(id,user_id,analyst_id,action,recommended_at,profile:analyst_profiles!inner(id,user_id,display_name)))';
  let query=db.from('trades').select(select,{count:'exact'}).eq('user_id',ownerId).eq('decision.user_id',ownerId)
    .eq('decision.rec.user_id',ownerId).eq('decision.rec.profile.user_id',ownerId);
  if(analystId)query=query.eq('decision.rec.analyst_id',analystId);
  const {rows,count}=await getRows(query.order('executed_at',{ascending:false}).order('id',{ascending:false}).limit(rowLimit),signal);
  if(!Number.isInteger(count))throw Error('正式系统未返回成交总数。');
  const lines=rows.map(row=>{
    verifyOwner(row,ownerId);
    const decision=one(row.decision);verifyOwner(decision,ownerId);
    const rec=one(decision.rec),name=recommendationProfile(rec,ownerId,analystId);
    if(!['buy','sell'].includes(row.direction)||number(row.price)===null||number(row.quantity)===null)throw Error('正式成交字段无效。');
    return formatTime(row.executed_at)+' '+name+' '+label(row.ticker)+' '+(row.direction==='buy'?'买入':'卖出')+' '+
      numberFormat.format(number(row.quantity))+' 股 × '+formatPrice(row.price,row.currency)+(number(row.fee)>0?'｜手续费 '+formatPrice(row.fee,row.currency):'')+
      '｜来源建议 '+actions[rec.action]+'（'+formatTime(rec.recommended_at)+'）';
  });
  return [listHeader('我的投资 · 建议关联的模拟成交',count,rows.length),...lines].join('\n');
}

/** @param {object} db
 * @param {{ownerId:string,analystId:string|null,sections:string[]}} scope
 * @param {{signal?:AbortSignal}} options
 */
export async function readFormalOverview(db,{ownerId,analystId,sections}, {signal=AbortSignal.timeout(18000)}={}){
  if(!isUuid(ownerId)||(analystId!==null&&!isUuid(analystId))||!validFormalSections(sections))throw Error('正式查询范围无效。');
  const [analysis,trades]=await Promise.all([
    sections.some(key=>key!=='trades')?readAnalysis(db,ownerId,analystId,sections,signal):[],
    sections.includes('trades')?readLinkedTrades(db,ownerId,analystId,signal):null,
  ]);
  return ['正式模拟账户查询（'+(analystId===null?'全账户':'指定分析师')+'，北京时间）',...analysis,trades].filter(Boolean).join('\n\n');
}

export function createFormalReader(env=process.env,{fetchImpl=fetch}={}){
  const origin=env.FEISHU_SIMULATION_ORIGIN,token=env.FEISHU_SIMULATION_INGEST_TOKEN;
  if(!origin&&!token)return undefined;
  const target=new URL(origin);
  if(target.href!==target.origin+'/'||!token||(target.protocol!=='https:'&&!(target.protocol==='http:'&&
    ['127.0.0.1','localhost','[::1]'].includes(target.hostname))))throw Error('正式查询地址无效。');
  return async ({expectedOwnerId,analystKey,sections})=>{
    if(!isUuid(expectedOwnerId)||(analystKey!==null&&(typeof analystKey!=='string'||!/^[A-Za-z0-9._:-]{1,200}$/u.test(analystKey)))||
      !validFormalSections(sections))throw Error('正式查询参数无效。');
    const url=new URL('/api/integrations/feishu/overview',target);
    url.searchParams.set('owner',expectedOwnerId);
    if(analystKey!==null)url.searchParams.set('analyst',analystKey);
    url.searchParams.set('sections',sections.join(','));
    const res=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+token}});
    if(!res.ok)throw Object.assign(Error('正式查询服务暂不可用。'),{status:res.status});
    const packet=await res.json();
    if(typeof packet?.text!=='string'||!packet.text.trim()||packet.text.length>12000)throw Error('正式查询回复格式无效。');
    return packet.text;
  };
}
