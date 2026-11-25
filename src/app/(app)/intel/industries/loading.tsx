'use client';
// src/app/(app)/intel/industries/loading.tsx
// Loading state of every industry page (canvas "States" loading): a static skeleton the size of the
// heatmap; no spinner, no "Loading…" text (DESIGN.md §4 Loading States).
import {usePathname,useSearchParams} from 'next/navigation';
import {StateNotice} from '@/components/industries/StateNotice';

export default function IndustriesLoading(){
  const path=usePathname(),search=useSearchParams();
  if(path.includes('/intel/industries/sw2021/')||path.endsWith('/intel/industries')&&search.get('scheme')==='sw2021')return null;
  return (<div className="mx-auto max-w-[1400px]"><StateNotice kind="loading" /></div>);
}
