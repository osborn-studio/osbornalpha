// src/app/(app)/admin/broker-research/review/[reportId]/review-model.test.ts
import {describe,expect,it} from 'vitest';
import {blockerColumns,blockerParts,buildTyped,conflictGroups,correctionPayload,fieldKind,groupFields,isStaleRun,normalizeReviewPayload,remainingChars,segmentText} from './review-model';
import type {FieldRow} from '@/lib/broker-research/types';

const f=(o:Partial<FieldRow>):FieldRow=>({field_id:'x',report_id:'r',parse_run_id:'p1',run_id:'run',superseded_by_run_id:null,target_key:'T',field:'target_price',occurrence:1,page:1,char_start:0,char_end:1,value_source_text:'1',extractor:'llm:m@r',extractor_confidence:null,status:'extracted',corrected:null,conflict_group:null,detail:{},reviewed_by:null,reviewed_at:null,created_at:'',value_text:'1',value_num:'1',value_currency:null,value_unit:'price',value_date:null,...o});

describe('typed editing',()=>{
 it('validates per field kind and returns a full TypedValue with explicit nulls',()=>{
  expect(fieldKind('target_price')).toBe('price');expect(fieldKind('wacc')).toBe('pct');expect(fieldKind('target_horizon')).toBe('months');expect(fieldKind('published_date')).toBe('date');expect(fieldKind('target_currency')).toBe('currency');expect(fieldKind('analyst')).toBe('text');
  expect(buildTyped('target_price',{value_text:'CNY 12.5',value_num:'12.50',value_currency:'cny',value_date:''})).toEqual({ok:true,value:{value_text:'CNY 12.5',value_num:'12.50',value_currency:'CNY',value_unit:'price',value_date:null}});
  expect(buildTyped('target_price',{value_text:'x',value_num:'12,5',value_currency:'',value_date:''})).toEqual({ok:false,error:'value_num'});
  expect(buildTyped('target_currency',{value_text:'usd',value_num:'',value_currency:'',value_date:''})).toEqual({ok:true,value:{value_text:'USD',value_num:null,value_currency:'USD',value_unit:null,value_date:null}});
  expect(buildTyped('target_horizon',{value_text:'12M',value_num:'12.5',value_currency:'',value_date:''})).toEqual({ok:false,error:'value_num'});
  expect(buildTyped('wacc',{value_text:'8.2%',value_num:'0.082',value_currency:'',value_date:''})).toMatchObject({ok:true,value:{value_unit:'pct',value_num:'0.082'}});
  expect(buildTyped('published_date',{value_text:'1 Oct 2026',value_num:'',value_currency:'',value_date:'2026-02-30'})).toEqual({ok:false,error:'value_date'});
  expect(buildTyped('analyst',{value_text:'  ',value_num:'',value_currency:'',value_date:''})).toEqual({ok:false,error:'value_text'});
 });
});

describe('grouping, conflicts, staleness',()=>{
 it('groups live rows by target and finds open conflict groups',()=>{
  const rows=[f({field_id:'a',conflict_group:'g'}),f({field_id:'b',conflict_group:'g',value_num:'2'}),f({field_id:'c',target_key:null,field:'title'}),f({field_id:'d',superseded_by_run_id:'new'})];
  const g=groupFields(rows);
  expect([...g.keys()]).toEqual(['T','']);expect(g.get('T')!.map(x=>x.field_id)).toEqual(['a','b']);
  expect([...conflictGroups(rows).keys()]).toEqual(['g']);
  expect(conflictGroups([f({field_id:'a',conflict_group:'g'}),f({field_id:'b',conflict_group:'g',status:'confirmed'})]).size).toBe(0);
 });
 it('stale when a live row points at another parse run',()=>{
  expect(isStaleRun('p1',[f({})])).toBe(false);expect(isStaleRun('p2',[f({})])).toBe(true);expect(isStaleRun('p2',[f({superseded_by_run_id:'n'})])).toBe(false);expect(isStaleRun(null,[f({})])).toBe(false);
 });
});

describe('blockers',()=>{
 it('splits the code and builds the two columns',()=>{
  expect(blockerParts('report_incomplete:title')).toEqual({key:'report_incomplete',arg:'title'});expect(blockerParts('required_field_missing:rating:600000.SH')).toEqual({key:'required_field_missing',arg:'rating:600000.SH'});
  expect(blockerColumns(['review_not_approved','licence_unconfirmed'])).toEqual({reviewReady:['licence_unconfirmed'],publishReady:['review_not_approved','licence_unconfirmed']});
  expect(blockerColumns(['review_not_approved']).reviewReady).toEqual([]);
 });
});

describe('page text',()=>{
 it('segments around non-overlapping spans in order, UTF-16 offsets',()=>{
  expect(segmentText('ab😀cd',[{start:2,end:4,id:'s'}])).toEqual([{text:'ab',id:null},{text:'😀',id:'s'},{text:'cd',id:null}]);
  expect(segmentText('abcdef',[{start:3,end:5,id:'y'},{start:1,end:4,id:'x'}])).toEqual([{text:'a',id:null},{text:'bcd',id:'x'},{text:'ef',id:null}]);
  expect(segmentText('abc',[{start:2,end:9,id:'z'}])).toEqual([{text:'ab',id:null},{text:'c',id:'z'}]);
 });
 it('remaining chars',()=>{expect(remainingChars(80,30)).toBe(50);expect(remainingChars(10,12)).toBe(-2);expect(remainingChars(null,3)).toBeNull();});
 it('normalizes the review payload or rejects it',()=>{
  expect(normalizeReviewPayload({nope:1})).toBeNull();
  const p=normalizeReviewPayload({report:{report_id:'r'},document:{document_id:'d'},licence:{licence_id:'l'},fields:[]})!;
  expect(p.targets).toEqual([]);expect(p.blockers).toEqual([]);expect(p.quarantine).toEqual([]);expect(p.reportAnalysts).toEqual([]);
 });
 it('builds the C6 correct payload in camelCase with an optional framed span',()=>{
  const v={value_text:'CNY 12.5',value_num:'12.50',value_currency:'CNY',value_unit:'price' as const,value_date:null};
  expect(correctionPayload(v)).toEqual({valueText:'CNY 12.5',valueNum:'12.50',valueCurrency:'CNY',valueUnit:'price',valueDate:null});
  expect(correctionPayload(v,{page:2,start:3,end:9})).toMatchObject({page:2,charStart:3,charEnd:9});
 });
});

// Pages and client imports are checked here because D4 and the shared boundary inventory are not
// present/owned in this worktree. Follow imports including erased broker type imports.
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=process.cwd(),adminRoot=path.join(root,'src/app/(app)/admin/broker-research');
const pageDirs=['documents/[documentId]','review/[reportId]','preview/[reportId]'];
for(const dir of pageDirs)it(`${dir} gates service reads and stays dynamic`,()=>{
 const source=readFileSync(path.join(adminRoot,dir,'page.tsx'),'utf8');
 expect(source).not.toContain("'use client'");expect(source).toContain("dynamic='force-dynamic'");expect(source).toContain('await adminGate(');
});
it('keeps server dependencies out of all D5 client graphs',()=>{
 const options:ts.CompilerOptions={moduleResolution:ts.ModuleResolutionKind.Bundler,baseUrl:root,paths:{'@/*':['src/*']},allowJs:true};
 const broker=path.join(root,'src/lib/broker-research'),seen=new Set<string>(),bad:string[]=[];
 const visit=(file:string)=>{
  if(seen.has(file))return;seen.add(file);
  if(['public-read.ts','db.ts','pg-db.ts','deps.ts','admin-document.ts','preview.ts'].some(n=>file===path.join(broker,n))||file.startsWith(path.join(root,'src/lib/entities')+path.sep)){bad.push(file);return;}
  const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const walk=(node:ts.Node)=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
    const spec=node.moduleSpecifier.text;
    if(spec.startsWith('.')||spec.startsWith('@/')){
     const target=ts.resolveModuleName(spec,file,options,ts.sys).resolvedModule?.resolvedFileName;
     if(target&&target.startsWith(path.join(root,'src')+path.sep))visit(target);
    }
   }
   ts.forEachChild(node,walk);
  };walk(tree);
 };
 for(const dir of pageDirs)for(const name of readdirSync(path.join(adminRoot,dir)))if(name.endsWith('.tsx')){
  const file=path.join(adminRoot,dir,name);if(ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true).statements.some(n=>ts.isExpressionStatement(n)&&ts.isStringLiteral(n.expression)&&n.expression.text==='use client'))visit(file);
 }
 expect(bad).toEqual([]);
});

import React from 'react';
import {act,create} from 'react-test-renderer';
import type {ReactTestRenderer} from 'react-test-renderer';
import {vi} from 'vitest';
import {ReviewClient} from './ReviewClient';
import {PublishDialog} from './PublishDialog';
import {DocumentClient} from '../../documents/[documentId]/DocumentClient';
import type {DocumentPageData} from '@/lib/broker-research/admin-document';
import type {LicenceRow,ReviewPayload} from '@/lib/broker-research/types';
const additions=JSON.parse(readFileSync(path.join(root,'messages/en/foreign-research.json'),'utf8'));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('next-intl',()=>({useLocale:()=> 'en',useTranslations:(ns:string)=>{
 const tr=(key:string)=>key;tr.has=()=>true;return Object.assign((key:string)=>`${ns}.${tr(key)}`,{has:()=>true});
}}));
vi.mock('next/link',()=>({default:({children,...props}:Record<string,unknown>)=>React.createElement('a',props,children as React.ReactNode)}));
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const reviewPayload=()=>({report:{report_id:'r',document_id:'d',status:'draft',review_status:'pending',disclosure_ok:true,code_version:'v'},document:{document_id:'d',current_parse_run_id:'p1',page_count:2},licence:{licence_id:'l',snippet_max_chars:10},fields:[],targets:[],snippets:[],summaries:[],runs:[],blockers:['review_not_approved'],quarantine:[],institutions:[],analysts:[],reportAnalysts:[]} as unknown as ReviewPayload);
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
it('Shared messages have identical locale keys and complete page sections',()=>{
 const fragments=['zh','en'].map(locale=>JSON.parse(readFileSync(path.join(root,`messages/${locale}/foreign-research.json`),'utf8')));
 const keys=(o:Record<string,unknown>,prefix=''):string[]=>Object.entries(o).flatMap(([k,v])=>typeof v==='string'?[prefix+k]:keys(v as Record<string,unknown>,`${prefix}${k}.`));
 expect(keys(fragments[0])).toEqual(keys(fragments[1]));expect(Object.keys(additions.admin)).toEqual(expect.arrayContaining(['document','review','publish','previewPage']));
});
it('clears previous private page text and selection as soon as the page changes',async()=>{
 let renderer:ReactTestRenderer;
 const fetchMock=vi.fn(async(url:unknown)=>{
  if(String(url).endsWith('/reports/r'))return response(reviewPayload());
  if(String(url).endsWith('/pages/1'))return response({documentId:'d',parseRunId:'p1',page:1,text:'PAGE-ONE-PRIVATE',pageCount:2});
  return new Promise<Response>(()=>{});
 });vi.stubGlobal('fetch',fetchMock);
 try{
  await act(async()=>{renderer=create(React.createElement(ReviewClient,{reportId:'r'}));});
  expect(JSON.stringify(renderer!.toJSON())).toContain('PAGE-ONE-PRIVATE');
  const next=renderer!.root.findAllByType('button').find(b=>b.children.join('')==='foreign-research.admin.review.page.next')!;
  await act(async()=>{next.props.onClick();});
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('PAGE-ONE-PRIVATE');
 }finally{await act(async()=>renderer!.unmount());vi.unstubAllGlobals();}
});
it('withdrawn review data is replaced by the withdrawal message',async()=>{
 let renderer:ReactTestRenderer;
 vi.stubGlobal('fetch',vi.fn(async()=>response({error:{code:'document_withdrawn'}},410)));
 try{await act(async()=>{renderer=create(React.createElement(ReviewClient,{reportId:'r'}));});expect(JSON.stringify(renderer!.toJSON())).toContain('foreign-research.admin.review.withdrawn');}
 finally{await act(async()=>renderer!.unmount());vi.unstubAllGlobals();}
});
it('publish dialog loads blockers and keeps publishing disabled',async()=>{
 let renderer:ReactTestRenderer;
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const fetchMock=vi.fn(async()=>response({blockers:['licence_unconfirmed']}));vi.stubGlobal('fetch',fetchMock);
 try{
  await act(async()=>{renderer=create(React.createElement(PublishDialog,{reportId:'r',licence:{version:1} as LicenceRow,approvedSnippets:0,approvedSummaries:0,codeVersion:'v',onClose:()=>{}}));});
  expect(fetchMock.mock.calls.length).toBe(1);
  expect(JSON.stringify(renderer!.toJSON())).toContain('foreign-research.admin.review.blockers.licence_unconfirmed');
  expect(renderer!.root.findAllByType('button').find(b=>b.children.join('')==='foreign-research.admin.publish.publish')!.props.disabled).toBe(true);
 }finally{await act(async()=>renderer!.unmount());vi.unstubAllGlobals();}
});

it('reloads logged page text after a write changes the current parse run',async()=>{
 let renderer:ReactTestRenderer,reads=0;
 const fetchMock=vi.fn(async(url:unknown,init?:RequestInit)=>{
  if(init?.method==='POST')return response({});
  if(String(url).endsWith('/reports/r')){const p=reviewPayload();p.document.current_parse_run_id=++reads===1?'p1':'p2';p.blockers=[];return response(p);}
  return response({documentId:'d',parseRunId:reads===1?'p1':'p2',page:1,text:reads===1?'OLD-PARSE':'NEW-PARSE',pageCount:2});
 });vi.stubGlobal('fetch',fetchMock);
 try{
  await act(async()=>{renderer=create(React.createElement(ReviewClient,{reportId:'r'}));});
  const approve=renderer!.root.findAllByType('button').find(b=>b.children.join('')==='foreign-research.admin.review.actions.markReviewed')!;
  await act(async()=>{await approve.props.onClick();});
  expect(JSON.stringify(renderer!.toJSON())).toContain('NEW-PARSE');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('OLD-PARSE');
 }finally{await act(async()=>renderer!.unmount());vi.unstubAllGlobals();}
});
it('publishes only after checking blockers and displays the fetched immutable receipt',async()=>{
 let renderer:ReactTestRenderer;
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const requests:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:unknown,init?:RequestInit)=>{
  requests.push(`${init?.method} ${url}`);
  if(String(url).endsWith('/publish-blockers'))return response({blockers:[]});
  if(init?.method==='POST')return response({publicationId:'pub'});
  return response({publication:{snapshot_hash:'SNAPSHOT-HASH',rules_receipt_id:'RULE-RECEIPT',licence_version:7}});
 }));
 try{
  await act(async()=>{renderer=create(React.createElement(PublishDialog,{reportId:'r',licence:{version:7} as LicenceRow,approvedSnippets:0,approvedSummaries:0,codeVersion:'v',onClose:()=>{}}));});
  const publish=renderer!.root.findAllByType('button').find(b=>b.children.join('')==='foreign-research.admin.publish.publish')!;
  expect(publish.props.disabled).toBe(false);
  await act(async()=>{await publish.props.onClick();});
  expect(requests).toEqual(['GET /api/admin/broker-research/reports/r/publish-blockers','POST /api/admin/broker-research/reports/r/publish','GET /api/admin/broker-research/publications/pub']);
  expect(JSON.stringify(renderer!.toJSON())).toContain('SNAPSHOT-HASH');
  expect(JSON.stringify(renderer!.toJSON())).toContain('foreign-research.admin.publish.f4Queued');
 }finally{await act(async()=>renderer!.unmount());vi.unstubAllGlobals();}
});

it('opens an isolated window synchronously and only navigates after the logged URL response',async()=>{
 let renderer:ReactTestRenderer,resolveUrl:(r:Response)=>void=()=>{};
 const popup={opener:{},location:{replace:vi.fn()},close:vi.fn()};
 const open=vi.fn(()=>popup);vi.stubGlobal('window',{open});
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{resolveUrl=resolve;})));
 const data={document:{document_id:'d',sha256:'12345678abcdef',status:'parsed',original_filename:'Synthetic.pdf'},licence:null,report:null,runs:[],purgeSteps:[]} as unknown as DocumentPageData;
 try{
  await act(async()=>{renderer=create(React.createElement(DocumentClient,{data}));});
  const view=renderer!.root.findAllByType('button').find(b=>b.children.join('')==='foreign-research.admin.document.actions.viewOriginal')!;
  await act(async()=>{view.props.onClick();});
  expect(open).toHaveBeenCalledWith('about:blank','_blank');expect(popup.opener).toBeNull();expect(popup.location.replace).not.toHaveBeenCalled();
  await act(async()=>{resolveUrl(response({url:'https://private.example/signed'}));});
  expect(popup.location.replace).toHaveBeenCalledWith('https://private.example/signed');
 }finally{await act(async()=>renderer!.unmount());vi.unstubAllGlobals();}
});
