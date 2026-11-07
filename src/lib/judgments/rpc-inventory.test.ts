// F4 Task 22 (spec §5.6): the runbook inventory and rollback cover every SQL function.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {F4_FUNCTIONS,INTERNAL_FUNCTION_NAMES,PUBLIC_RPC_NAMES,SERVICE_RPC_NAMES} from './rpc-inventory';

const RUNBOOK=readFileSync('docs/runbooks/judgments.md','utf8');
const section=(n:number)=>{const start=RUNBOOK.indexOf(`\n## ${n}. `);const end=RUNBOOK.indexOf('\n## ',start+1);return RUNBOOK.slice(start,end===-1?undefined:end);};
const mentions=(s:string,n:string)=>new RegExp(`\\b${n}\\b`).test(s);

describe('runbook function inventory',()=>{
 it('§1 lists every public, service, and internal function in its group',()=>{
  const s=section(1),pub=s.slice(s.indexOf('公共读 RPC：'),s.indexOf('\n\n服务写 RPC')),
   svc=s.slice(s.indexOf('\n\n服务写 RPC'),s.indexOf('\n\n内部函数：')),internal=s.slice(s.indexOf('\n\n内部函数：'));
  for(const n of PUBLIC_RPC_NAMES)expect({n,ok:mentions(pub,n)}).toEqual({n,ok:true});
  for(const n of SERVICE_RPC_NAMES)expect({n,ok:mentions(svc,n)}).toEqual({n,ok:true});
  for(const n of INTERNAL_FUNCTION_NAMES)expect({n,ok:mentions(internal,n)}).toEqual({n,ok:true});
 });
 it('§8 rollback names every function',()=>{
  for(const n of Object.keys(F4_FUNCTIONS))expect({n,ok:mentions(section(8),n)}).toEqual({n,ok:true});
 });
});
