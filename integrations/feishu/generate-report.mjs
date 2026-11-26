import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {readConfiguredBindings} from '../../demos/analyst-replay/feishu-onboarding.mjs';
import {beijingDateTime} from './beijing-time.mjs';
import {publicAnalystDirectory} from './feishu-analyst-roster.mjs';
import {createFormalReader} from './feishu-formal-read.mjs';
import {createGroupScopedReader} from './feishu-group-report.mjs';

const sections = ['recommendations', 'scores', 'trades'];
const recommendationHeading = /^正式分析建议（共 (\d+) 条(?:，列最近 (\d+) 条)?）$/u;
const tradeHeading = /^(?:我的投资 · 建议关联的模拟成交|分析师建议关联的模拟成交)（共 (\d+) 条(?:，列最近 (\d+) 条)?）$/u;
const scoreSummary = /^有效建议 (\d+) 条｜(?:命中率 [\d.]+%（(\d+)\/(\d+)）|暂无可判定命中的样本)｜(?:平均分 (-?[\d.]+)（(\d+) 条有分数）|暂无已评分样本)$/u;
const sourceHeading = '正式模拟账户查询（指定分析师，北京时间）';
const escape = value => String(value).replace(/[&<>"']/gu, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const invalid = () => { throw Error('正式返回的范围或格式无法核对，本次报表未生成。'); };

function readRows(lines, names) {
  return lines.map(line => {
    const parts = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}) (.+)$/u.exec(line);
    const name = parts && names.find(alias => parts[2].startsWith(alias + ' '));
    if (!name) invalid();
    const value = parts[2].slice(name.length + 1);
    const match = /^([A-Za-z0-9.^:_-]{1,28}) (买入|卖出|加仓|减仓|持有|观望)(.*)$/u.exec(value);
    if (!match || /(?:\b(?:ou|oc|om|cli)_|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|https?:\/\/)/iu.test(match[3])) invalid();
    return {at:parts[1], ticker:match[1], action:match[2], details:match[3].replace(/^[｜ ]+/u,'').split('｜').filter(Boolean).join(' · ')};
  });
}

function readList(block, pattern, names) {
  const [heading, ...lines] = block.split('\n');
  const match = pattern.exec(heading);
  if (!match) invalid();
  const count = Number(match[1]);
  if (lines.length !== Math.min(5, count) || Number(match[2] ?? count) !== lines.length) invalid();
  return {count, rows:readRows(lines, names)};
}

// The deployed integration publishes full per-person counts alongside at most five example rows.
// Keep the three independent lists; timestamps and tickers are not unique recommendation keys.
export function parseNamedReport(text, label, names) {
  const [heading, adviceBlock, scoresBlock, tradesBlock, ...extra] = text.trim().split('\n\n');
  if (heading !== sourceHeading || !adviceBlock || !scoresBlock || !tradesBlock || extra.length) invalid();
  const recommendations = readList(adviceBlock, recommendationHeading, names);
  const trades = readList(tradesBlock, tradeHeading, names);
  const [scoreTitle, summary, detailTitle, ...scoreLines] = scoresBlock.split('\n');
  const score = scoreSummary.exec(summary);
  if (scoreTitle !== '正式建议评分' || !score || (detailTitle && detailTitle !== '最近有评分或命中判定的建议')) invalid();
  const active = Number(score[1]), hits = Number(score[2] ?? 0), assessed = Number(score[3] ?? 0);
  const average = score[4] === undefined ? null : Number(score[4]), scored = Number(score[5] ?? 0);
  if (active > recommendations.count || hits > assessed || assessed > active || scored > active ||
      (average !== null && !Number.isFinite(average)) || scoreLines.length > 5 ||
      scoreLines.length < Math.min(5,Math.max(assessed,scored))) invalid();
  return {label, recommendations, trades, active, hits, assessed, average, scored, scoreRows:readRows(scoreLines,names)};
}

export async function fetchSnapshot(config, reader) {
  const initial = config();
  const members = publicAnalystDirectory(initial).filter(entry => !entry.demo);
  if (!initial.chatId || initial.simulationAccount?.confirmed !== true || !initial.approverIds?.length || !reader) invalid();
  const scoped = createGroupScopedReader(reader, config);
  const reports = [];
  for (const {role, label} of members) {
    if (!label) invalid();
    const names = [initial.analystNamesByRole?.[role], ...(initial.analystAliasesByRole?.[role] ?? []), label, role]
      .filter(Boolean).sort((a,b) => b.length-a.length);
    const text = await scoped({expectedOwnerId:initial.simulationAccount.id, analystKey:role, sections});
    reports.push(parseNamedReport(text, label, names));
  }
  const current = config();
  if (current.chatId !== initial.chatId || current.simulationAccount?.id !== initial.simulationAccount.id ||
      current.simulationAccount?.confirmed !== true || !current.approverIds?.length ||
      JSON.stringify(publicAnalystDirectory(current).filter(entry => !entry.demo)) !== JSON.stringify(members)) invalid();
  return reports;
}

function detailTable(reports, section) {
  const rows = reports.flatMap(report => (section === 'scores' ? report.scoreRows : report[section].rows)
    .map(row => ({...row, label:report.label}))).sort((a,b) => b.at.localeCompare(a.at));
  const title = {recommendations:'登记明细',scores:'评分明细',trades:'模拟成交明细'}[section];
  if (!rows.length) return '<section class="panel"><h2>'+title+'</h2><p class="empty">'+
    {recommendations:'暂无登记建议。',scores:'暂无已得到分数或命中判定的建议。',trades:'暂无可追溯至所选分析师建议的模拟成交。'}[section]+'</p></section>';
  return '<section class="panel"><h2>'+title+'</h2><div class="scroll"><table><thead><tr><th>北京时间</th><th>分析师</th><th>标的</th><th>方向</th><th>'+
    {recommendations:'参考 / 目标 / 止损',scores:'得分 / 命中 / 区间收益',trades:'成交与来源建议'}[section]+
    '</th></tr></thead><tbody>'+rows.map(r => '<tr><td class="num">'+escape(r.at)+'</td><td>'+escape(r.label)+'</td><td class="num">'+escape(r.ticker)+'</td><td>'+
      escape(r.action)+'</td><td>'+escape(r.details || '—')+'</td></tr>').join('')+'</tbody></table></div></section>';
}

function view(reports, title, index, generated) {
  const sum = key => reports.reduce((total,r) => total+r[key],0);
  const registered = reports.reduce((n,r) => n+r.recommendations.count,0), trades = reports.reduce((n,r) => n+r.trades.count,0);
  const active = sum('active'), scored = sum('scored'), assessed = sum('assessed'), hits = sum('hits');
  const hitRate = assessed ? (hits/assessed*100).toFixed(1)+'%' : '—';
  // Per-person means in the live text API are rounded to one decimal.
  const approximate = reports.filter(r => r.scored).length > 1;
  const mean = scored ? (approximate?'≈ ':'')+(reports.reduce((n,r) => n+(r.average ?? 0)*r.scored,0)/scored).toFixed(1) : '—';
  const cards = [['已登记建议', registered, '有效 '+active+' 条 · 已撤回 '+(registered-active)+' 条'],['命中率',hitRate,'命中 '+hits+' 条 / 已判定 '+assessed+' 条'],
    ['平均评分',mean,scored+' 条建议已有得分'],['关联模拟成交',trades,'按实际成交笔数统计']];
  const rate = r => r.assessed ? (r.hits/r.assessed*100).toFixed(1)+'%（'+r.hits+'/'+r.assessed+'）' : '—';
  const metrics = '<div class="metrics">'+cards.map(([label,n,sub])=>'<div class="metric"><p>'+label+'</p><strong class="num">'+n+'</strong><small>'+sub+'</small></div>').join('')+'</div>';
  const analystTable = '<section class="panel"><h2>分析师概览</h2><div class="scroll"><table><thead><tr><th>分析师</th><th>登记建议</th><th>已评分</th><th>命中率</th><th>平均分</th><th>模拟成交</th></tr></thead><tbody>'+
    reports.map(r=>'<tr><td>'+escape(r.label)+'</td><td>'+r.recommendations.count+'</td><td>'+r.scored+'</td><td>'+rate(r)+'</td><td>'+(r.average ?? '—')+'</td><td>'+r.trades.count+'</td></tr>').join('')+'</tbody></table></div></section>';
  const contributing = reports.filter(r=>r.recommendations.count>0);
  const displayed = reports.flatMap(r=>r.recommendations.rows);
  const byTicker = new Map(), byAction = new Map();
  for (const {ticker,action} of displayed) {
    byTicker.set(ticker,(byTicker.get(ticker) ?? 0)+1);
    byAction.set(action,(byAction.get(action) ?? 0)+1);
  }
  const distribution = counts => [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([key,n])=>key+' '+n+' 条').join('、');
  const brief = [
    title+'共登记 '+registered+' 条建议，其中 '+active+' 条有效，'+(registered-active)+' 条已撤回。'+
      (reports.length>1 && contributing.length===1?'全部登记来自'+contributing[0].label+'。':''),
    ...(displayed.length ? ['本页展示的 '+displayed.length+' 条登记明细涉及 '+byTicker.size+' 个标的'+
      (byTicker.size <= 3 ? '（'+distribution(byTicker)+'）':'')+'，方向分布为'+distribution(byAction)+'。'] : []),
    scored ? scored+' 条有效建议已有得分，平均分为 '+mean+'。' : '当前没有已评分样本，平均分暂缺。',
    assessed ? assessed+' 条有效建议已有命中判定，其中 '+hits+' 条命中，命中率为 '+hitRate+'。' :
      '当前没有已判定样本，暂时无法评价命中表现。',
    trades ? '正式模拟组合中可追溯至这些分析师建议的成交共有 '+trades+' 笔。' : '截至快照时间，正式模拟组合中暂无与这些建议关联的成交。',
  ];
  const methodology='登记与成交按全历史计数。方向命中使用第 5 个交易日的结果。评分使用方向调整后的 20 个交易日收益，尚无 20 日收益时使用 5 日收益。两个指标分别统计已有对应结果的有效建议，已撤回建议从分母中剔除。每位分析师的每类明细最多展示最近 5 条。'+
    (approximate?'全组平均分由已取整的个人均分按评分样本数加权估算。':'');
  const md = value=>String(value).replace(/[\\\x60*_[\]<>|]/gu,c=>'\\'+c);
  const paragraphs = ['# Osborn Alpha · 分析师报告','范围为'+md(title)+'，数据截至北京时间 '+generated+'。',
    '## 分析摘要',brief.map(p=>'- '+md(p)).join('\n'),'## 分析师概览',
    ['| 分析师 | 登记 | 已评分 | 命中率 | 平均分 | 关联模拟成交 |','| --- | ---: | ---: | ---: | ---: | ---: |',
      ...reports.map(r=>'| '+[r.label,r.recommendations.count,r.scored,rate(r),r.average ?? '—',r.trades.count].map(md).join(' | ')+' |')].join('\n')];
  for (const [section,heading] of [['recommendations','登记明细'],['scores','评分明细'],['trades','模拟成交明细']]) {
    const rows = reports.flatMap(r=>(section==='scores'?r.scoreRows:r[section].rows).map(row=>({...row,label:r.label})))
      .sort((a,b)=>b.at.localeCompare(a.at));
    paragraphs.push('## '+heading,rows.length ? rows.map(r=>'- '+[r.at,r.label,r.ticker,r.action,r.details].filter(Boolean).map(md).join(' · ')).join('\n') : '暂无明细。');
  }
  paragraphs.push('## 统计口径',methodology);
  const markdown=paragraphs.join('\n\n')+'\n';
  const html='<article data-view="'+index+'"'+(index?' hidden':'')+'><div class="scope"><h2>'+escape(title)+'</h2><span>全历史</span></div>'+metrics+
    '<section class="panel brief"><h2>分析报告</h2>'+brief.map(p=>'<p>'+escape(p)+'</p>').join('')+'</section>'+
    analystTable+sections.map(section=>detailTable(reports,section)).join('')+'<p class="method">'+methodology+'</p><template class="export">'+escape(markdown)+'</template></article>';
  return {html,markdown};
}

export async function renderSnapshot(reports, generated = new Date()) {
  const options = ['全组', ...reports.map(r=>r.label)];
  const template = await readFile(new URL('./report-snapshot.html',import.meta.url),'utf8');
  const time=beijingDateTime(generated);
  const views=options.map((label,index)=>view(index?[reports[index-1]]:reports,label,index,time));
  const slots = {TIME:time,OPTIONS:options.map((label,index)=>'<option value="'+index+'">'+escape(label)+'</option>').join(''),
    VIEWS:views.map(v=>v.html).join('')};
  return {html:template.replace(/@@(TIME|OPTIONS|VIEWS)@@/gu,(_,name)=>slots[name]),markdown:views[0].markdown};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../../',import.meta.url));
  const directory = process.env.FEISHU_DATA_DIR || join(root,'build/feishu');
  const data = await fetchSnapshot(()=>readConfiguredBindings(directory),createFormalReader());
  const {html,markdown} = await renderSnapshot(data);
  for (const [extension,body] of [['html',html],['md',markdown]]) {
    const output = join(root,'build/reports/osborn-analyst-report.'+extension);
    await mkdir(dirname(output),{recursive:true,mode:0o700});
    const tmp = output+'.'+randomUUID()+'.tmp';
    try {
      await writeFile(tmp,body,{mode:0o600,flag:'wx'});
      await rename(tmp,output);
    } finally { await rm(tmp,{force:true}); }
    console.log(output);
  }
}
