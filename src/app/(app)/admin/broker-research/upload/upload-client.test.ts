// src/app/(app)/admin/broker-research/upload/upload-client.test.ts
import {describe,expect,it} from 'vitest';
import {MAX_BYTES,sha256Hex,sniffPdf,validatePdfFile} from './upload-client';

describe('upload helpers',()=>{
 it('hashes with Web Crypto exactly like sha256sum',async()=>{
  expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 });
 it('checks the %PDF- header and size',async()=>{
  expect(await sniffPdf(new Blob(['%PDF-1.7 ...']))).toBe(true);expect(await sniffPdf(new Blob(['hello']))).toBe(false);
  expect(validatePdfFile({name:'a.pdf',type:'application/pdf',size:10})).toBeNull();
  expect(validatePdfFile({name:'a.txt',type:'text/plain',size:10})).toBe('not_pdf');
  expect(validatePdfFile({name:'a.pdf',type:'application/pdf',size:MAX_BYTES+1})).toBe('too_large');
  expect(validatePdfFile({name:'a.pdf',type:'application/pdf',size:0})).toBe('empty');
 });
});

// Exercise the browser flow with synthetic bytes and isolated transport ports.
import {afterEach,vi} from 'vitest';
import {createElement} from 'react';
import {act,create} from 'react-test-renderer';
import type {ReactTestRenderer} from 'react-test-renderer';
import * as helpers from './upload-client';
import {UploadClient} from './UploadClient';
vi.mock('next/link',()=>({default:({children,...props}:{children:import('react').ReactNode;href:string})=>createElement('a',props,children)}));
vi.mock('next-intl',()=>({useTranslations:()=>Object.assign((key:string)=>key,{has:()=>false})}));
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const pdf=()=>Object.assign(new Blob(['%PDF-1.7 synthetic'],{type:'application/pdf'}),{name:'synthetic.pdf'}) as File;
async function mounted(){
 let tree!:ReactTestRenderer;
 await act(async()=>{tree=create(createElement(UploadClient,{licences:[{licenceId:'L',label:'Synthetic',version:1,confirmed:true,confirmedAt:null}]}));});
 return tree;
}
const button=(tree:ReactTestRenderer,text:string)=>tree.root.findAllByType('button').find(b=>b.children.includes(text))!;
it('cancel resets the step and ignores an older hash finishing afterwards',async()=>{
 let finish!:(s:string)=>void;
 vi.spyOn(helpers,'sha256Hex').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const tree=await mounted();let choosing!:Promise<void>;
 await act(async()=>{choosing=tree.root.findByType('input').props.onChange({target:{files:[pdf()]}});await Promise.resolve();});
 await act(async()=>{button(tree,'cancel').props.onClick();});
 await act(async()=>{finish('old-hash');await choosing;});
 expect(tree.root.findAllByType('li').find(li=>li.props['aria-current']==='step')?.children.join('')).not.toContain('sha');
 expect(tree.root.findAllByType('li')[0].props['aria-current']).toBe('step');
 expect(JSON.stringify(tree.toJSON())).not.toContain('old-hash');
 await act(async()=>tree.unmount());
});
it('uploads raw bytes once, then retries an intent_busy commit exactly once',async()=>{
 vi.useFakeTimers();
 vi.spyOn(helpers,'sha256Hex').mockResolvedValue('synthetic-hash');
 const put=vi.spyOn(helpers,'putSigned').mockResolvedValue();
 const f=vi.fn().mockResolvedValueOnce(Response.json({intentId:'intent',uploadUrl:'https://private.test/signed'}))
  .mockResolvedValueOnce(Response.json({error:{code:'intent_busy'}},{status:409}))
  .mockResolvedValueOnce(Response.json({documentId:'doc'}));
 vi.stubGlobal('fetch',f);
 const tree=await mounted();const file=pdf();
 await act(async()=>{await tree.root.findByType('input').props.onChange({target:{files:[file]}});});
 await act(async()=>{tree.root.findByType('select').props.onChange({target:{value:'L'}});});
 await act(async()=>{button(tree,'submit').props.onClick();await Promise.resolve();});
 await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
 expect(put).toHaveBeenCalledWith('https://private.test/signed',file,expect.any(Function));
 expect(f).toHaveBeenCalledTimes(3);
 expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({byte_size:file.size,licence_id:'L',original_filename:'synthetic.pdf'});
 expect(tree.root.findAllByType('a').some(a=>a.props.href==='/admin/broker-research/documents/doc')).toBe(true);
 await act(async()=>tree.unmount());
});

it('PUTs PDF bytes with no upsert and reports computable progress',async()=>{
 let xhr!:{status:number;upload:{onprogress?:(e:{lengthComputable:boolean;loaded:number;total:number})=>void};onload?:()=>void;open:ReturnType<typeof vi.fn>;setRequestHeader:ReturnType<typeof vi.fn>;send:ReturnType<typeof vi.fn>};
 vi.stubGlobal('XMLHttpRequest',class{status=201;upload={};open=vi.fn();setRequestHeader=vi.fn();send=vi.fn();constructor(){xhr=this;}});
 const progress=vi.fn(),file=pdf(),pending=helpers.putSigned('https://private.test/signed',file,progress);
 expect(xhr.open).toHaveBeenCalledWith('PUT','https://private.test/signed');
 expect(xhr.setRequestHeader.mock.calls).toEqual([['content-type','application/pdf'],['x-upsert','false']]);
 expect(xhr.send).toHaveBeenCalledWith(file);
 xhr.upload.onprogress?.({lengthComputable:true,loaded:5,total:10});
 expect(progress).toHaveBeenCalledWith(5,10);xhr.onload?.();await pending;
 const failed=helpers.putSigned('https://private.test/signed',file,progress);
 xhr.status=403;xhr.onload?.();await expect(failed).rejects.toThrow('upload_http_403');
});
