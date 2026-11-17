import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import zh from '../../../messages/zh/research.json';
import en from '../../../messages/en/research.json';
import {lineSegments} from './chart-gaps';
import {ChartTableSwitch} from './ChartTableSwitch';
it('breaks at gaps while retaining singletons and point identity',()=>{
 const points=[1,2,null,null,3,4,null,5].map((y,x)=>({x,y}));
 const runs=lineSegments(points);
 expect(runs.map(r=>r.length)).toEqual([2,2,1]);
 expect(runs.flat().every(p=>p.y!==null && p.y!==0)).toBe(true);
 expect(runs[0][0]).toBe(points[0]);
 expect(lineSegments([{y:null},{y:null}])).toEqual([]);expect(lineSegments([])).toEqual([]);
 expect(lineSegments([{y:0}])).toEqual([[{y:0}]]);
});
it.each(['zh','en'] as const)('renders an accessible table in both views in %s',locale=>{
 const catalog=locale==='zh'?zh:en;
 const render=(defaultView?:'chart'|'table')=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{research:catalog},children:createElement(ChartTableSwitch,{chart:createElement('div',{'data-chart':true}),table:createElement('table',{'data-table':true}),defaultView})}));
 const html=render();
 expect(html).toContain('data-chart');expect(html).toMatch(/<div class="sr-only"><table data-table/);
 const buttons=[...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m=>m[0]);
 expect(buttons).toHaveLength(2);expect(buttons[0]).toContain('aria-pressed="true"');expect(buttons[1]).toContain('aria-pressed="false"');
 expect(buttons[0]).toContain(catalog.view.chart);expect(buttons[1]).toContain(catalog.view.table);
 const table=render('table');expect(table).not.toContain('data-chart');expect(table).not.toContain('sr-only');expect(table).toContain('data-table');
});
