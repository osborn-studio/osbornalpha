// src/lib/company/fixtures/manifest.ts
// Reader of src/lib/company/fixtures/manifest.json (spec §12.0, §0 #72). Node-only (fs): unit tests, e2e and
// scripts use it, app code never does. An expectation is usable only once a human has transcribed it:
// status 'ready' and no 'pending' string anywhere in expected/source.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export const MANIFEST_PATH='src/lib/company/fixtures/manifest.json';
export const PENDING='pending';
export const EXPECTATION_KINDS=['statement_cell','filing_published_list','statement_matrix'] as const;
export type ExpectationKind=typeof EXPECTATION_KINDS[number];
export interface ManifestFixture{id:string;path:string;sha256:string;recorded_at:string|null;source:string}
export interface ManifestSource{document:string;page_or_row:string;url:string;transcribed_by:string;transcribed_at:string|null}
export interface ManifestExpectation{id:string;kind:ExpectationKind;status:'pending'|'ready';query:Record<string,unknown>;expected:Record<string,unknown>;source:ManifestSource;notes?:string}
export interface Manifest{version:number;note:string;fixtures:ManifestFixture[];expectations:ManifestExpectation[]}

export function containsPending(v:unknown):boolean{
 if(v===PENDING)return true;
 if(Array.isArray(v))return v.some(containsPending);
 if(v!==null&&typeof v==='object')return Object.values(v).some(containsPending);
 return false;
}
export const isReady=(e:ManifestExpectation)=>e.status==='ready'&&!containsPending(e.expected)&&!containsPending(e.source)&&e.source.transcribed_at!==null;
export function loadManifest(root=process.cwd()):Manifest{
 return JSON.parse(readFileSync(join(root,MANIFEST_PATH),'utf8')) as Manifest;
}
export function readyExpectation(id:string,root?:string):ManifestExpectation|null{
 const e=loadManifest(root).expectations.find(x=>x.id===id);
 return e&&isReady(e)?e:null;
}
