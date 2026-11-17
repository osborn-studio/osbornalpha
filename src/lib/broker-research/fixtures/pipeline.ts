// Synthetic three-page report and recorded responses for C4–C8 (spec §12.1/§12.4).
import type {F3Artifact} from '../ports/f3';
export const PIPELINE_TICKER='ZZBR';
export const PAGES:readonly string[]=[
 ['Synthetic Broker Research Ltd','ZZ Robotics Inc (ZZBR US)','Initiation: Building the platform','Rating: Overweight',
  'Price target: US$120.00 (12-month)','Price (as of 2026-10-30): US$100.00','Upside: 20.0%','Analyst: Jane Placeholder','Published 2026-11-02'].join('\n'),
 'Valuation: discounted cash flow with WACC 9.0% and terminal growth 2.5%.\nThe platform thesis rests on recurring service revenue.',
 'Risks: execution on new product lines, customer concentration, and supply constraints.',
];
export const EXTRACTOR_VERSION='fake-f3/1';
export const pipelineExtraction=(sha256:string):F3Artifact=>({extractor_version:EXTRACTOR_VERSION,content_sha256:sha256,page_count:PAGES.length,ocr_used:false,ocr_version:null,pages:PAGES.map((text,i)=>({page:i+1,text}))});
const ev=(value:string,quote:string,page=1)=>({value,page,quote,confidence:0.9});
export const EXTRACT_OBJECT={
 scope:'single_issuer',institution:ev('Synthetic Broker Research Ltd','Synthetic Broker Research Ltd'),analysts:[ev('Jane Placeholder','Jane Placeholder')],
 published_date:ev('2026-11-02','Published 2026-11-02'),title:ev('Initiation: Building the platform','Initiation: Building the platform'),
 valuation_method:ev('DCF','discounted cash flow',2),wacc:ev('9.0%','WACC 9.0%',2),terminal_growth:ev('2.5%','terminal growth 2.5%',2),
 targets:[{ticker:ev('ZZBR US','ZZBR US'),rating:ev('Overweight','Overweight'),target_price:ev('120.00','120 .00'),target_currency:ev('USD','US$'),
  target_horizon_months:ev('12','12-month'),price_at_report:ev('100.00','100.00'),price_currency:ev('USD','US$'),price_as_of_date:ev('2026-10-30','2026-10-30'),upside_stated:ev('20.0%','20.0%')}],
};
export const EXTRACT_RESPONSE=JSON.stringify(EXTRACT_OBJECT);
export const SUMMARY_RESPONSE=['## 报告定位','机构对该标的给出首次覆盖观点，核心是平台化的服务收入。','## 核心结论','研究认为经常性服务收入是估值的主要支撑。',
 '## 方法论','报告采用现金流折现方法。','## 风险与边界','新产品执行、客户集中与供应约束是主要风险。'].join('\n');
export const TITLE_RESPONSE=JSON.stringify({zh:'首次覆盖：打造平台',en:'Initiation: Building the platform'});
