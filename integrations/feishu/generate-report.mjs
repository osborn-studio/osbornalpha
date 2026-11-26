import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {readConfiguredBindings} from '../../demos/analyst-replay/feishu-onboarding.mjs';
import {beijingDateTime} from './beijing-time.mjs';
import {createFormalReader} from './feishu-formal-read.mjs';
import {fetchSnapshot, summarizeReports} from './feishu-published-report.mjs';
export {fetchSnapshot, parseNamedReport} from './feishu-published-report.mjs';

const sections = ['recommendations', 'scores', 'trades'];
const escape = value => String(value).replace(/[&<>"']/gu, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
  const {registered, trades, active, scored, assessed, hits, hitRate, approximate, mean} = summarizeReports(reports);
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
