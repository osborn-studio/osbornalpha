// src/lib/judgments/origins.ts
// Frozen origin table (spec §3.5: "origin 不是自由文本"). Every input's {publisher, adapter,
// locator, transform} comes from ORIGINS keyed `${kind}×${adapter}`: builders call originFor();
// registerJudgment checks originKnown() (unknown key → input_origin_unknown). Licence status is NOT
// here (commander decision D3): this file is in every method's import closure, so a licence
// confirmation must not touch it — it lives in docs/methodologies/licenses.json (same keys), read only
// by scripts/judgments/sync-methodologies.ts to gate publishable. Publishers are the ORIGINAL
// publishers (exchanges, SEC), adapters the forwarding services (spec §2.3 数据源许可).
import type {InputKind,Origin} from './types';
import {JudgmentError} from './errors';

export interface OriginTemplate{publisher:string;adapter:string;locator:string;transform?:string;optional_transforms?:readonly string[]}
const row=(t:OriginTemplate):Readonly<OriginTemplate>=>Object.freeze({...t,...(t.optional_transforms?{optional_transforms:Object.freeze([...t.optional_transforms])}:{})});
const SEC='SEC EDGAR（发行人 XBRL 申报，companyfacts）';
const CN_EXCHANGES='上交所 / 深交所 / 北交所定期报告（经 Tushare 转发）';
export const ORIGINS:Readonly<Record<string,Readonly<OriginTemplate>>>=Object.freeze({
 'financial_fact×edgar':row({publisher:SEC,adapter:'edgar',locator:'financial_facts:{fact_id}@filings:{filing_id}'}),
 'financial_fact×tushare':row({publisher:CN_EXCHANGES,adapter:'tushare',locator:'financial_facts:{fact_id}@filings:{filing_id}'}),
 'financial_metric×edgar':row({publisher:SEC,adapter:'edgar',locator:'derive:{issuer_id}:{metric}:{period_start}:{period_end}',transform:'derive:{formula_version}'}),
 'financial_metric×tushare':row({publisher:CN_EXCHANGES,adapter:'tushare',locator:'derive:{issuer_id}:{metric}:{period_start}:{period_end}',transform:'derive:{formula_version}'}),
 'macro_observation×macro_workbench':row({publisher:'宏观序列原发布方（见宏观目录 macro_series）',adapter:'macro_workbench',locator:'macro_observations:{series_id}:{period_end}:{vintage_id}'}),
 'macro_snapshot×macro_workbench':row({publisher:'OsbornAlpha 宏观工作台（由已发布观测派生的快照）',adapter:'macro_workbench',locator:'macro_snapshots:{snapshot_id}'}),
 'price_bar×eastmoney':row({publisher:'交易所行情（经东方财富转发）',adapter:'eastmoney',locator:'eastmoney:kline:{market}:{ticker}:{date}:{adjustment}'}),
 'price_bar×datagateway':row({publisher:'交易所行情（经 DataGateway 转发）',adapter:'datagateway',locator:'datagateway:daily:{market}:{ticker}:{date}:{adjustment}',optional_transforms:['close_only']}),
 'table_rows×supabase_public':row({publisher:'OsbornAlpha 主数据（发行人与行业分类）',adapter:'supabase_public',locator:'public.{table}:{natural_key}'}),
 'table_rows×macro_workbench':row({publisher:'OsbornAlpha 宏观工作台（序列目录）',adapter:'macro_workbench',locator:'macro_series:{natural_key}'}),
 'judgment×judgments':row({publisher:'OsbornAlpha 判断层（公共表 judgments）',adapter:'judgments',locator:'judgments:{judgment_id}'}),
 'legacy_fill×eastmoney':row({publisher:'交易所行情（经东方财富转发；分析师评分层冻结的成交价）',adapter:'eastmoney',locator:'recommendations:{recommendation_id}'}),
});
const ORIGIN_KEYS=new Set(['publisher','adapter','locator','transform']);
const VAR=/\{([a-z_]+)\}/g;
export const originKey=(kind:InputKind,adapter:string)=>`${kind}×${adapter}`;
function render(template:string,vars:Record<string,string>,key:string):string{
 return template.replace(VAR,(_,name:string)=>{const v=vars[name];if(typeof v!=='string'||v==='')throw new JudgmentError('input_origin_unknown',`${key}: origin variable ${name} missing`);return v;});
}
const escapeRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patternOf=(template:string)=>new RegExp(`^${template.split(/\{[a-z_]+\}/).map(escapeRe).join('.+')}$`);
export function originFor(kind:InputKind,adapter:string,vars:Record<string,string>,opts:{transform?:string}={}):Origin{
 const key=originKey(kind,adapter);const t=ORIGINS[key];
 if(!t)throw new JudgmentError('input_origin_unknown',`no origin row ${key}`);
 let transform:string|undefined;
 if(t.transform!==undefined){
  if(opts.transform!==undefined)throw new JudgmentError('input_origin_unknown',`${key}: transform is fixed by the table`);
  transform=render(t.transform,vars,key);
 }else if(opts.transform!==undefined){
  if(!(t.optional_transforms??[]).includes(opts.transform))throw new JudgmentError('input_origin_unknown',`${key}: transform ${opts.transform} not allowed`);
  transform=opts.transform;
 }
 return {publisher:t.publisher,adapter:t.adapter,locator:render(t.locator,vars,key),...(transform!==undefined?{transform}:{})};
}
/** Template variables match loosely (`.+`): exact locator equality is enforced by Task 8's rebuildAndCompare.
 * True iff `origin` could have been produced by originFor for this kind (key, publisher, locator / transform shape, no extra keys). */
export function originKnown(kind:InputKind,origin:Origin):boolean{
 if(!origin||typeof origin!=='object'||Object.keys(origin).some(k=>!ORIGIN_KEYS.has(k)))return false;
 if(kind==='table_rows'&&origin.adapter==='industry-agg/1.0')return origin.publisher==='OsbornAlpha'&&/^manifest:[0-9a-f]{64}$/.test(origin.locator)&&typeof origin.transform==='string'&&/^[0-9a-f]{64}(;history_class=reconstruction)?$/.test(origin.transform);
 const t=ORIGINS[originKey(kind,origin.adapter)];
 if(!t||origin.publisher!==t.publisher)return false;
 if(typeof origin.locator!=='string'||!patternOf(t.locator).test(origin.locator))return false;
 if(t.transform!==undefined)return typeof origin.transform==='string'&&patternOf(t.transform).test(origin.transform);
 return !('transform' in origin)||(t.optional_transforms??[]).includes(origin.transform as string);
}
