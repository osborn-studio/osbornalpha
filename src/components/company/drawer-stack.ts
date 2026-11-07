// src/components/company/drawer-stack.ts
// Pure state of the drawer stack (plan 2026-11-06 Task 12 review fix): every opened drawer stays in the
// stack (mounted, only the top is interactive); closing pops the top and names the entry whose opener
// must get focus back. No DOM here, so the focus rules are unit-testable without a DOM library.
export interface StackEntry<T>{id:number;target:T}
export interface StackState<T>{entries:StackEntry<T>[];nextId:number;/** id of the entry just closed: its opener gets focus. */returnFocusTo:number|null}
export type StackAction<T>={type:'open';target:T}|{type:'close'}|{type:'focused'}|{type:'reset'};
export const emptyStack=<T,>():StackState<T>=>({entries:[],nextId:1,returnFocusTo:null});
export function stackReducer<T>(s:StackState<T>,a:StackAction<T>):StackState<T>{
 if(a.type==='open')return {entries:[...s.entries,{id:s.nextId,target:a.target}],nextId:s.nextId+1,returnFocusTo:null};
 if(a.type==='reset')return s.entries.length===0&&s.returnFocusTo===null?s:{...s,entries:[],returnFocusTo:null};   // access mode changed: no drawer outlives the data it was opened with
 if(a.type==='close'){
  if(s.entries.length===0)return s;
  const top=s.entries[s.entries.length-1];
  return {...s,entries:s.entries.slice(0,-1),returnFocusTo:top.id};
 }
 return s.returnFocusTo===null?s:{...s,returnFocusTo:null};
}
/** Only the top entry is interactive; lower ones stay mounted but inert and hidden from assistive tech. */
export const isInteractive=<T,>(s:StackState<T>,id:number)=>s.entries.length>0&&s.entries[s.entries.length-1].id===id;
