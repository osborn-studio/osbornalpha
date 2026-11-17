import {createElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it,vi} from 'vitest';
import zh from '../../../messages/zh/industries.json';
import en from '../../../messages/en/industries.json';
import researchZh from '../../../messages/zh/research.json';
import researchEn from '../../../messages/en/research.json';
import {SchemeSwitch,SchemeLevelSwitch} from './SchemeLevelSwitch';
import {CoverageCell} from './CoverageCell';
import {PageHeader} from '@/components/research-ui';
import {SeriesChart} from './SeriesChart';
import {LatestValues} from './LatestValues';
import {StateNotice} from './StateNotice';
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:()=>true}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:()=>({cells:[]})}));
import {publicCell,runHeader} from '@/lib/industry/read';
import {cellRow,runRow} from '@/lib/industry/fixture-rows';
const cell=publicCell(cellRow({value:'0.478'}));
const header=runHeader(runRow());
const node={code:cell.code,level:1,nameZh:'行业',nameEn:'Industry',parentCode:null};
const render=(children:ReactNode,locale:'zh'|'en'='zh')=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{industries:locale==='zh'?zh:en,research:locale==='zh'?researchZh:researchEn},children}));
it.each(['zh','en'] as const)('header keeps both scheme links, withheld badge and supplied freshness in %s',locale=>{
 const scopeSwitch=createElement(SchemeSwitch,{path:'/intel/industries',search:{},scheme:'sic',swPublic:false});
 const html=render(createElement(PageHeader,{title:'Industry',scope:'Scope',freshness:{status:'stale',asOf:'2026-11-03'},scopeSwitch}),locale);
 expect(html).toContain('href="/intel/industries?scheme=sw2021"');
 expect(html).toContain('href="/intel/industries?scheme=sic"');
 expect(html).toContain('data-research-state="withheld"');
 expect(html).toContain('data-freshness="stale"');expect(html).toContain('2026-11-03');
 expect(render(createElement(SchemeSwitch,{path:'/intel/industries',search:{},scheme:'sic',swPublic:true}),locale)).not.toContain('data-research-state="withheld"');
 expect(render(createElement(SchemeLevelSwitch,{path:'/intel/industries',search:{},scheme:'sic',level:1}),locale)).toBe('');
 expect(render(createElement(SchemeLevelSwitch,{path:'/intel/industries',search:{},scheme:'sw2021',level:1}),locale).match(/<a /g)).toHaveLength(3);
});
it.each(['members','coverageSic','insufficient','missing','unresolved','unlicensed'] as const)('renders shared %s without the suppressed number',display=>{
 const html=render(createElement(CoverageCell,{cell:{...cell,display,value:'999999999999'},metric:cell.metric}));
 expect(html).toContain('data-research-state=');expect(html).not.toContain('999');
});
it('series table contains one row per input point, including gaps, basis and available times',()=>{
 const points=[{periodEnd:'2024-12-31',cell:null},{periodEnd:'2025-12-31',cell}];
 const html=render(createElement(SeriesChart,{scheme:'sic',node,metric:cell.metric,points,header,preview:false,tableOnly:true}));
 const body=html.split('<tbody>')[1].split('</tbody>')[0];
 expect(body.match(/<tr /g)).toHaveLength(points.length);
 expect(body).toContain('data-research-state="missing"');
 expect(body).toContain('data-research-state="reconstructed"');
 expect(html).toContain(zh.drawer.availableAt);
});
it('summary selects latest requested basis without backfilling suppressed values',()=>{
 const html=render(createElement(LatestValues,{scheme:'sic',node,metric:cell.metric,duration:'12M',header,preview:false,cells:[{...cell,periodEnd:'2024-12-31',display:'value'},{...cell,periodEnd:'2025-12-31',display:'members',value:'999999999999'}]}));
 expect(html).toContain('2025-12-31');expect(html).not.toContain('2024-12-31');
 expect(html).toContain('data-research-state="lowCoverage"');expect(html).not.toContain('999');
 expect(html).toContain(`${cell.nWithData}/${cell.nMembers+cell.nUnresolved}`);
});
it('phone notices retain a reachable remainder and shared reconstruction badge',()=>{
 const html=render(createElement(StateNotice,{kind:'reconstruction',body:'第一句。第二句。'}));
 expect(html).toContain('data-research-state="reconstructed"');
 expect(html).toContain('<details');expect(html).toContain('<summary');expect(html).toContain('第二句。');
});
