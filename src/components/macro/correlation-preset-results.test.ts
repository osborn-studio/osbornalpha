import {act,createElement} from 'react';
import {create,type ReactTestRenderer} from 'react-test-renderer';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({listener:undefined as undefined|((event:string)=>void)}));
vi.mock('@/lib/supabase/client',()=>({getBrowserSupabase:()=>({auth:{onAuthStateChange:(listener:(event:string)=>void)=>{auth.listener=listener;return {data:{subscription:{unsubscribe:()=>{auth.listener=undefined;}}}};}}})}));
vi.mock('./use-macro-t',()=>({useMacroT:()=>({locale:'en',t:(k:string)=>k})}));
vi.mock('./CorrelationResult',()=>({CorrelationResult:({run,mode}:{run:{error:string};mode:string})=>createElement('output',null,`${mode}:${run.error}`)}));
vi.mock('next/link',()=>({default:({href,children}:{href:string;children:unknown})=>createElement('a',{href},children as string)}));
import {CorrelationPresetResults} from './CorrelationPresetResults';
let root:ReactTestRenderer;
const card={preset_id:'p1',run_id:null,status:'failed',error:'insufficient_sample',spec:{kind:'change',indicator_id:'US_DFF',asset_id:'US_UST10Y',lag:0,window:'10y',request_id:'preset'},inputs_hash:'old-cutoff',data_hash:'same'};
let savedHash:string;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);savedHash='same';
 vi.stubGlobal('fetch',vi.fn(async(url:string,opts?:RequestInit)=>new Response(JSON.stringify(opts?.method==='POST'?{runId:'saved'}:url.includes('/presets?')?{cards:[card]}:{run:{...card,run_id:'saved',inputs_hash:'new-cutoff',data_hash:savedHash}}),{status:opts?.method==='POST'?201:200})));
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());vi.unstubAllGlobals();});
const mount=async()=>{await act(async()=>{root=create(createElement(CorrelationPresetResults,{region:'US'}));});};
const save=async()=>{await act(async()=>{root.root.findAllByType('button').find(b=>b.children.includes('correlation.preset.recalculate'))!.props.onClick();});};
it('loads default failed cards and recalculates through POST without comparing cutoff hashes',async()=>{
 await mount();expect(root.root.findByType('output').children).toEqual(['preset:insufficient_sample']);
 expect(fetch).toHaveBeenCalledWith('/api/macro/analyses/presets?region=US',expect.objectContaining({cache:'no-store'}));
 await save();expect(JSON.stringify(root.toJSON())).not.toContain('correlation.preset.inputsChanged');
 const call=vi.mocked(fetch).mock.calls.find(([,o])=>o?.method==='POST')!;
 expect(JSON.parse(call[1]!.body as string)).toMatchObject({indicator_id:'US_DFF'});
 expect(JSON.parse(call[1]!.body as string).request_id).not.toBe('preset');
 expect(root.root.findByType('a').props.href).toBe('/macro/analyses/saved');
});
it('shows inputsChanged only for changed data_hash',async()=>{
 savedHash='revised';await mount();await save();expect(JSON.stringify(root.toJSON())).toContain('correlation.preset.inputsChanged');
});
it('shows no-snapshot state and never issues a POST automatically',async()=>{
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({cards:[],reason:'no_published_snapshot'})));
 await mount();expect(JSON.stringify(root.toJSON())).toContain('correlation.preset.noSnapshot');expect(fetch).toHaveBeenCalledTimes(1);
});
it('retries a saved result read without posting another run',async()=>{
 await mount();vi.mocked(fetch).mockImplementationOnce(async()=>new Response(JSON.stringify({runId:'saved'}),{status:201})).mockRejectedValueOnce(Error('offline'));
 await save();await save();expect(vi.mocked(fetch).mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});

it('clears visible preset and saved results on sign out',async()=>{
 await mount();await save();expect(root.root.findAllByType('output')).toHaveLength(2);
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({error:{code:'unauthenticated'}}),{status:401}));
 await act(async()=>{auth.listener!('SIGNED_OUT');});
 expect(root.root.findAllByType('output')).toHaveLength(0);
});
