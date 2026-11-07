// Row labels → the 18 concepts (spec §7.5 step 4, 6th draft table; all ids are landed spec-2
// FACT_CONCEPTS). A label is NFKC-normalised (╱ → /), stripped of leading bullets/dashes, a trailing
// note number and a trailing colon, and matched as a WHOLE string (case-insensitive) — the label
// itself, or its core without a trailing parenthesis such as (港仙) / (附註5). Bilingual HKEX labels
// ("Revenue from contracts with customers 與客戶之間的合同產生的收入") are also split by script: the
// Latin words and the Han part are matched separately and the concepts united, so one row naming the
// same concept in both scripts is one concept (not ambiguous); two different concepts stay ambiguous.
// Variants seen in recorded HK reports (0268.HK 2026 interim) are in the rules: 與客戶之間的合同產生的
// 收入, 當期盈利╱（虧損）, Profit/(loss) for the period, 所得稅沖回 / income tax credit, 稀釋, Net cash
// inflow/(outflow) from … activities, 經營活動產生╱（所用）淨現金, Net (decrease)/increase in cash
// and cash equivalents, 總資產 / 總負債 / 總權益. Rules apply only on their own
// statement. net_income_parent only inside an attribution section about profit (not the
// comprehensive-income attribution); eps_* only inside an EPS section; equity_parent needs no section
// (its label already says 應佔). A heading is a non-row line: 應佔/应占/attributable to opens an
// attribution section — comprehensive-income when it names 全面收益/全面收入/comprehensive, profit when
// it names 溢利/利潤/利润/profit, otherwise decided by the previous row's label; 每股盈利/每股收益/
// earnings per share opens the EPS section. Unmatched labels are not "missing values": nothing is
// summed or guessed.
import type {StatementKind} from './locate';

export type Section='attribution'|'attribution_ci'|'eps'|null;
export interface LabelRule{concept:string;statement:StatementKind;re:RegExp;section?:'attribution'|'eps'}
const R=(src:string)=>new RegExp(`^(?:${src})$`,'i');
const cfFlow=(zhT:string,zhS:string,en:string)=>`${zhT}活動(?:所得|產生|所用)(?:\\/\\((?:所得|產生|所用)\\))?(?:[的之]?現金(?:流量)?淨額|淨現金)|${zhS}活动(?:所得|产生|所用)(?:\\/\\((?:所得|产生|所用)\\))?(?:[的之]?现金(?:流量)?净额|净现金)|net cash (?:(?:inflow|outflow)(?:\\/\\((?:inflow|outflow)\\))? (?:from|used in)|generated from|used in|from) ${en} activities`;
export const LABEL_RULES:readonly LabelRule[]=[
 {concept:'revenue',statement:'IS',re:R('收益|收入|營業額|营业额|與客戶之間的合同產生的收入|与客户之间的合同产生的收入|客戶合同收入|客户合同收入|revenue|turnover|revenue from contracts with customers')},
 {concept:'cost_of_revenue',statement:'IS',re:R('銷售成本|销售成本|cost of sales|cost of revenue')},
 {concept:'gross_profit',statement:'IS',re:R('毛利|gross profit')},
 {concept:'operating_income',statement:'IS',re:R('經營溢利|经营溢利|經營利潤|经营利润|operating profit')},
 {concept:'income_tax',statement:'IS',re:R('所得稅(?:開支|抵免|沖回)?|所得税(?:开支|抵免|冲回)?|income tax(?: expense| credit)?')},
 {concept:'net_income',statement:'IS',re:R('(?:年內|期內|本年度|本期間|當期|年内|期内|本期间|当期)(?:溢利|利潤|利润|盈利)(?:\\/\\((?:虧損|亏损)\\))?|(?:profit|profit\\/\\(loss\\)) for the (?:year|period)')},
 {concept:'net_income_parent',statement:'IS',section:'attribution',re:R('本公司(?:擁有人|拥有人|權益持有人|权益持有人|擁有者|拥有者)|owners of the company|equity holders of the company')},
 {concept:'eps_basic',statement:'IS',section:'eps',re:R('基本|basic')},
 {concept:'eps_diluted',statement:'IS',section:'eps',re:R('攤薄|摊薄|稀釋|稀释|diluted')},
 {concept:'total_assets',statement:'BS',re:R('資產總值|资产总值|總資產|总资产|total assets')},
 {concept:'total_liabilities',statement:'BS',re:R('負債總額|负债总额|總負債|总负债|total liabilities')},
 {concept:'equity_parent',statement:'BS',re:R('本公司(?:擁有人|拥有人|權益持有人|权益持有人)(?:應佔|应占)(?:權益|权益)|equity attributable to owners of the company')},
 {concept:'equity_total',statement:'BS',re:R('權益總額|权益总额|總權益|总权益|total equity')},
 {concept:'cash',statement:'BS',re:R('現金及現金等價物|现金及现金等价物|cash and cash equivalents')},
 {concept:'operating_cash_flow',statement:'CF',re:R(cfFlow('經營','经营','operating'))},
 {concept:'investing_cash_flow',statement:'CF',re:R(cfFlow('投資','投资','investing'))},
 {concept:'financing_cash_flow',statement:'CF',re:R(cfFlow('融資','融资','financing'))},
 {concept:'net_change_in_cash',statement:'CF',re:R('現金及現金等價物淨?\\(?(?:增加|減少)\\)?(?:\\/\\(?(?:增加|減少)\\)?)?(?:淨額)?|现金及现金等价物净?\\(?(?:增加|减少)\\)?(?:\\/\\(?(?:增加|减少)\\)?)?(?:净额)?|net \\(?(?:increase|decrease)\\)?(?: ?\\/ ?\\(?(?:increase|decrease)\\)?)? in cash and cash equivalents')},
];
export function normalizeLabel(raw:string):string{
 return raw.normalize('NFKC').replace(/╱/g,'/').replace(/\s+/g,' ').trim().replace(/^[-–—•·]+\s*/,'').replace(/\s*\d+(?:\(\w\))?$/,'').replace(/[:：]$/,'').trim();
}
export function labelCore(label:string):string{return label.replace(/\s*[（(][^（）()]*[）)]$/,'').trim();}
const HAN=/\p{Script=Han}/u,LATIN=/[A-Za-z]/;
/** The label itself and, for a label carrying both scripts, its Latin words and its Han part on their own. */
export function labelVariants(label:string):string[]{
 const full=normalizeLabel(label);
 if(!HAN.test(full)||!LATIN.test(full))return [full];
 const tokens=full.replace(/(\p{Script=Han})(?=[A-Za-z])/gu,'$1 ').replace(/([A-Za-z)])(?=\p{Script=Han})/gu,'$1 ').split(' ').filter(t=>t!=='');
 const latin=normalizeLabel(tokens.filter(t=>!HAN.test(t)).join(' '));
 const han=normalizeLabel(tokens.filter(t=>HAN.test(t)).join(''));
 return [full,...[latin,han].filter(v=>v!=='')];
}
export function matchConcepts(label:string,statement:StatementKind,section:Section):string[]{
 const out=new Set<string>();
 for(const v of labelVariants(label)){
  const core=labelCore(v);
  for(const r of LABEL_RULES)if(r.statement===statement&&(r.section===undefined||r.section===section)&&(r.re.test(core)||r.re.test(v)))out.add(r.concept);
 }
 return [...out];
}
const ATTRIBUTION=/應佔|应占|attributable to/i;
const COMPREHENSIVE=/全面收益|全面收入|綜合收益|综合收益|comprehensive/i;
const PROFIT=/溢利|利潤|利润|盈利|profit/i;
const EPS_HEADING=/每股盈利|每股收益|earnings(?:\/\(losses\))? per share/i;
/** The section a non-row line opens, or undefined when it is not a section heading (the current section continues). */
export function headingSection(text:string,previousRowLabel:string|null):Section|undefined{
 const t=text.normalize('NFKC');
 if(EPS_HEADING.test(t))return 'eps';
 if(!ATTRIBUTION.test(t))return undefined;
 if(COMPREHENSIVE.test(t))return 'attribution_ci';
 if(PROFIT.test(t))return 'attribution';
 return previousRowLabel!==null&&COMPREHENSIVE.test(previousRowLabel.normalize('NFKC'))?'attribution_ci':'attribution';
}
