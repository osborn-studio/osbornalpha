'use client';
import Link from 'next/link';
import type {Boundary} from '@/lib/macro/strategy/contract';
import {useMacroT} from './use-macro-t';
export const MACRO_TABS = ['overview','indicators','correlation','transmission','history','review','methodology'] as const;
export type MacroTab = typeof MACRO_TABS[number];
/** Construct fresh parameters in canonical order; boundary changes never append old query values. */
export function macroTabHref(tab: MacroTab, region: 'US'|'CN', boundary?: Boundary) {
 const view=tab==='overview'||tab==='indicators'||tab==='correlation'||tab==='methodology';
 const query=new URLSearchParams({region});
 if(view) query.set('tab',tab);
 if(tab==='history' && boundary) query.set('boundary',boundary);
 return `${view?'/macro':`/macro/${tab}`}?${query}`;
}
export function MacroTabs({active,region='US',onView}:{active:MacroTab;region?:'US'|'CN';onView?:(tab:'overview'|'indicators'|'correlation'|'methodology')=>void}) {
 const {t}=useMacroT();
 return <nav aria-label={t('tabs.label')} className="flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap border-b border-border">
  {MACRO_TABS.map(tab=>{
   const view=tab==='overview'||tab==='indicators'||tab==='correlation'||tab==='methodology';
   return <Link key={tab} href={macroTabHref(tab,region)}
    aria-current={tab===active?'page':undefined}
    onClick={view&&onView?e=>{if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onView(tab);}}:undefined}
    className={`px-3 py-2 text-sm ${tab===active?'border-b-2 border-accent font-semibold text-text':'text-text-dim'}`}>{t(`tabs.${tab}`)}</Link>;
  })}
 </nav>;
}
