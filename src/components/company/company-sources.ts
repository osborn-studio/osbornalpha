import type {ResearchSource} from '@/components/research-ui';
// Facts adapter originOf maps SH/SZ/BJ to sse/szse/bse; CN citations use cninfo-link.
const CN_SOURCES = [
  {publisher:'SSE',relay:'Tushare'},
  {publisher:'SZSE',relay:'Tushare'},
  {publisher:'BSE',relay:'Tushare'},
];
export const DIRECTORY_SOURCES:readonly ResearchSource[] = [{publisher:'SEC EDGAR'},...CN_SOURCES,{publisher:'CNINFO'}];
export function companyExchangePublisher(ticker:string):string {
  return ticker.endsWith('.SH')?'SSE':ticker.endsWith('.SZ')?'SZSE':ticker.endsWith('.BJ')?'BSE':'';
}
export function companySources(market:string|null,ticker:string):readonly ResearchSource[] {
  if(market==='US') return [{publisher:'SEC EDGAR'}];
  if(market!=='CN') return [];
  const publisher=companyExchangePublisher(ticker);
  const source=publisher?{publisher,relay:'Tushare'}:null;
  return [...(source?[source]:[]),{publisher:'CNINFO'}];
}
